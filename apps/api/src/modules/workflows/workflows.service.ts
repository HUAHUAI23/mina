import type {
  CreateWorkflowInput,
  CreateWorkflowRunInput,
  UpdateNodeMediaViewInput,
  UpdateWorkflowInput,
  Workflow,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowRun,
} from '@mina/contracts'

import { HttpError } from '../../lib/http/http-error'
import { DEFAULT_ACCOUNT_ID } from '../accounts/accounts.data'
import type { TasksService } from '../tasks/tasks.service'
import { createInitialNodeStates, WorkflowRunExecutor } from './execution'
import {
  findNearestFlowGroupId,
  getIncomingEdges,
  getNodeMap,
  isExecutableNode,
  isMediaWorkflowNode,
} from './graph'
import { findOutputByMediaView, slotToResourceKind } from './media'
import { validateCanvas, validateFlowGroup } from './validation'
import { NoopWorkflowRunEventLog, workflowRunEventPayload, type WorkflowRunEventLog } from './workflow-events'
import type { WorkflowNodeTaskLink, WorkflowRepository } from './workflows.repository'

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const cloneNodes = (nodes: WorkflowCanvasNode[]): WorkflowCanvasNode[] => structuredClone(nodes)
const cloneEdges = (edges: WorkflowCanvasEdge[]): WorkflowCanvasEdge[] => structuredClone(edges)

export class WorkflowsService {
  private readonly runExecutor: WorkflowRunExecutor

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly tasksService: TasksService,
    private readonly workflowRunEventLog: WorkflowRunEventLog = new NoopWorkflowRunEventLog(),
  ) {
    this.runExecutor = new WorkflowRunExecutor(workflowRepository, tasksService, workflowRunEventLog)
  }

  async createWorkflow(input: CreateWorkflowInput, accountId = DEFAULT_ACCOUNT_ID): Promise<Workflow> {
    const timestamp = nowIso()
    const workflow: Workflow = {
      id: createId('workflow'),
      accountId,
      name: input.name,
      version: 1,
      nodes: cloneNodes(input.nodes),
      edges: cloneEdges(input.edges),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    validateCanvas(workflow.nodes, workflow.edges)
    return this.workflowRepository.create(workflow)
  }

  async deleteWorkflow(id: string): Promise<void> {
    const deleted = await this.workflowRepository.delete(id)
    if (!deleted) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
  }

  async getNodeTasks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]> {
    await this.getWorkflow(workflowId)
    return this.workflowRepository.listNodeTaskLinks(workflowId, nodeId)
  }

  async getRun(runId: string): Promise<WorkflowRun> {
    const run = await this.workflowRepository.findRunById(runId)
    if (!run) {
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', 'Workflow run not found.')
    }
    return run
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const workflow = await this.workflowRepository.findById(id)
    if (!workflow) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
    return workflow
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return this.workflowRepository.listRuns(workflowId)
  }

  async listWorkflows(accountId = DEFAULT_ACCOUNT_ID): Promise<Workflow[]> {
    return this.workflowRepository.list(accountId)
  }

  async updateNodeMediaView(
    workflowId: string,
    nodeId: string,
    input: UpdateNodeMediaViewInput,
  ): Promise<Workflow> {
    await this.getWorkflow(workflowId)
    return this.workflowRepository.updateNodeMediaView(workflowId, nodeId, input.mediaView)
  }

  async updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
    const current = await this.getWorkflow(id)
    if (current.version !== input.version) {
      throw new HttpError(409, 'WORKFLOW_VERSION_CONFLICT', 'Workflow version is stale.')
    }

    const updated: Workflow = {
      ...current,
      name: input.name ?? current.name,
      nodes: cloneNodes(input.nodes),
      edges: cloneEdges(input.edges),
      version: current.version + 1,
      updatedAt: nowIso(),
    }

    validateCanvas(updated.nodes, updated.edges)
    return this.workflowRepository.update(updated)
  }

  async createRun(workflowId: string, input: CreateWorkflowRunInput): Promise<WorkflowRun> {
    const workflow = await this.getWorkflow(workflowId)
    if (workflow.version !== input.expectedWorkflowVersion) {
      throw new HttpError(409, 'WORKFLOW_VERSION_CONFLICT', 'Workflow version is stale.')
    }

    const nodeMap = getNodeMap(workflow.nodes)
    const selectedNode = nodeMap.get(input.selectedNodeId)
    if (!selectedNode) {
      throw new HttpError(404, 'WORKFLOW_NODE_NOT_FOUND', 'Selected workflow node not found.')
    }
    if (!isExecutableNode(selectedNode)) {
      throw new HttpError(422, 'WORKFLOW_NODE_NOT_EXECUTABLE', 'Selected workflow node is not executable.')
    }

    const scopeGroupNodeId = findNearestFlowGroupId(selectedNode.id, nodeMap)
    if (scopeGroupNodeId) {
      validateFlowGroup(workflow.nodes, workflow.edges, scopeGroupNodeId)
    } else {
      await this.preflightIsolatedNode(workflow, selectedNode)
    }

    const timestamp = nowIso()
    const run: WorkflowRun = {
      id: createId('workflow_run'),
      workflowId: workflow.id,
      accountId: workflow.accountId,
      workflowVersion: workflow.version,
      runMode: scopeGroupNodeId ? 'flow_group' : 'isolated_node',
      selectedNodeId: selectedNode.id,
      ...(scopeGroupNodeId ? { scopeGroupNodeId } : {}),
      snapshotNodes: cloneNodes(workflow.nodes),
      snapshotEdges: cloneEdges(workflow.edges),
      nodeStates: createInitialNodeStates(workflow.nodes, selectedNode.id, scopeGroupNodeId),
      status: 'running',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
    }

    const created = await this.workflowRepository.createRun(run)
    await this.recordWorkflowRunEvent(created, 'workflow.run.created', 'Workflow run was created.')
    return this.reconcileRun(created.id)
  }

  async cancelRun(runId: string): Promise<void> {
    const run = await this.getRun(runId)
    if (run.status !== 'running' && run.status !== 'queued') {
      throw new HttpError(409, 'WORKFLOW_RUN_NOT_CANCELLABLE', 'Only queued or running workflow runs can be cancelled.')
    }

    const cancelled = await this.workflowRepository.updateRun({
      ...run,
      status: 'cancelled',
      completedAt: nowIso(),
      updatedAt: nowIso(),
    })
    await this.recordWorkflowRunEvent(cancelled, 'workflow.run.cancelled', 'Workflow run was cancelled.')
  }

  async reconcileRunningRuns(): Promise<WorkflowRun[]> {
    return this.runExecutor.reconcileRunningRuns()
  }

  async reconcileRun(runId: string): Promise<WorkflowRun> {
    return this.runExecutor.reconcileRun(runId)
  }

  private async preflightIsolatedNode(workflow: Workflow, node: WorkflowCanvasNode): Promise<void> {
    const nodeMap = getNodeMap(workflow.nodes)
    for (const edge of getIncomingEdges(node.id, workflow.edges)) {
      const { connection } = edge.data
      if (!connection.required || connection.sourceSelector.mode === 'empty' || connection.targetSlot === 'prompt') {
        continue
      }

      if (connection.sourceSelector.mode === 'asset') {
        continue
      }

      if (connection.sourceSelector.mode !== 'current_media') {
        throw new HttpError(
          422,
          'WORKFLOW_ISOLATED_RUN_OUTPUT_SELECTOR',
          'Ordinary canvas execution requires current media selectors.',
        )
      }

      const sourceNode = nodeMap.get(edge.source)
      if (!sourceNode || !isMediaWorkflowNode(sourceNode) || !sourceNode.data.mediaView?.taskId) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_MISSING', 'Required upstream MediaView output is missing.')
      }

      const output = await this.tasksService.getTaskOutput(sourceNode.data.mediaView.taskId)
      const resource = output
        ? findOutputByMediaView(output, sourceNode.data.mediaView.outputResourceId, sourceNode.data.mediaView.outputIndex)
        : undefined
      const expectedKind = slotToResourceKind(connection.targetSlot)
      if (!resource) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_MISSING', 'Required upstream MediaView output is missing.')
      }
      if (expectedKind && resource.kind !== expectedKind) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_KIND_MISMATCH', 'Upstream output kind does not match target slot.')
      }
    }
  }

  private async recordWorkflowRunEvent(run: WorkflowRun, eventType: string, message: string): Promise<void> {
    await this.workflowRunEventLog.record({
      eventType,
      message,
      payload: workflowRunEventPayload(run),
      workflowRunId: run.id,
    })
  }

}

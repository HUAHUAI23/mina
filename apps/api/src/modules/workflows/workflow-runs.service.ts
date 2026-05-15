import type {
  CreateWorkflowRunInput,
  Workflow,
  WorkflowRun,
} from '@mina/contracts/modules/workflows'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { HttpError } from '../../lib/http/http-error'
import type { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import type { TasksService } from '../tasks/tasks.service'
import { WorkflowRunExecutor } from './run-executor'
import {
  findNearestFlowGroupId,
  getIncomingEdges,
  getNodeMap,
  isExecutableNode,
  isMediaWorkflowNode,
} from './graph'
import { findOutputByMediaView, slotToResourceKind } from './media-selection'
import { createInitialNodeStates } from './run-state'
import { validateFlowGroup } from './validation'
import { NoopWorkflowRunEventLog, workflowRunEventPayload, type WorkflowRunEventLog } from './workflow-events'
import type { WorkflowRepository } from './workflows.repository'

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const cloneNodes = (nodes: Workflow['nodes']): Workflow['nodes'] => structuredClone(nodes)
const cloneEdges = (edges: Workflow['edges']): Workflow['edges'] => structuredClone(edges)

export class WorkflowRunsService {
  private readonly runExecutor: WorkflowRunExecutor

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly tasksService: TasksService,
    taskConfigAssembler: TaskConfigAssembler,
    private readonly workflowRunEventLog: WorkflowRunEventLog = new NoopWorkflowRunEventLog(),
  ) {
    this.runExecutor = new WorkflowRunExecutor(workflowRepository, tasksService, taskConfigAssembler, workflowRunEventLog)
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

  async getRun(runId: string): Promise<WorkflowRun> {
    const run = await this.workflowRepository.findRunById(runId)
    if (!run) {
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', 'Workflow run not found.')
    }
    return run
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return this.workflowRepository.listRuns(workflowId)
  }

  async reconcileRunningRuns(): Promise<WorkflowRun[]> {
    return this.runExecutor.reconcileRunningRuns()
  }

  async reconcileRun(runId: string): Promise<WorkflowRun> {
    return this.runExecutor.reconcileRun(runId)
  }

  private async getWorkflow(id: string): Promise<Workflow> {
    const workflow = await this.workflowRepository.findById(id)
    if (!workflow) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
    return workflow
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

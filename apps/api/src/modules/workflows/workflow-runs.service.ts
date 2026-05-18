import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type {
  CreateWorkflowRunInput,
  Workflow,
  WorkflowRun,
} from '@mina/contracts/modules/workflows'

import { HttpError } from '../../lib/http/http-error'
import type { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import type { TasksService } from '../tasks/tasks.service'
import {
  findNearestFlowGroupId,
  getNodeMap,
  isDescendantOf,
  isExecutableNode,
  isMediaWorkflowNode,
  sortNodesForExecution,
} from './graph'
import { findOutputByMediaView, slotToResourceKind } from './media/media-input-builder'
import { mediaSlotItemsForNode, nodeOutputDependenciesForNode } from './media/node-media-slots'
import type { WorkflowMediaResolver } from './media/workflow-media-resolver'
import type { WorkflowDefinitionRepository } from './repositories/workflow-definition.repository'
import type { WorkflowNodeTaskRepository } from './repositories/workflow-node-task.repository'
import type { WorkflowRunRepository } from './repositories/workflow-run.repository'
import type { WorkflowRunNodeStateRepository } from './repositories/workflow-run-node-state.repository'
import type { WorkflowRunNodeDependency, WorkflowRunRecord } from './repositories/workflow-types'
import { validateFlowGroup } from './validation'
import { NoopWorkflowRunEventLog, workflowRunEventPayload, type WorkflowRunEventLog } from './workflow-events'
import { WorkflowRunExecutor } from './run-executor'

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const cloneNodes = (nodes: Workflow['nodes']): Workflow['nodes'] => structuredClone(nodes)
const cloneEdges = (edges: Workflow['edges']): Workflow['edges'] => structuredClone(edges)

const runRecordFromRun = (run: WorkflowRun): WorkflowRunRecord => ({
  id: run.id,
  workflowId: run.workflowId,
  accountId: run.accountId,
  workflowVersion: run.workflowVersion,
  runMode: run.runMode,
  selectedNodeId: run.selectedNodeId,
  ...(run.scopeGroupNodeId ? { scopeGroupNodeId: run.scopeGroupNodeId } : {}),
  status: run.status,
  ...(run.error ? { error: run.error } : {}),
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
  ...(run.startedAt ? { startedAt: run.startedAt } : {}),
  ...(run.completedAt ? { completedAt: run.completedAt } : {}),
})

interface WorkflowRunsServiceRepositories {
  definitions: WorkflowDefinitionRepository
  nodeStates: WorkflowRunNodeStateRepository
  nodeTasks: WorkflowNodeTaskRepository
  runs: WorkflowRunRepository
}

export class WorkflowRunsService {
  private readonly runExecutor: WorkflowRunExecutor

  constructor(
    private readonly repositories: WorkflowRunsServiceRepositories,
    private readonly tasksService: TasksService,
    taskConfigAssembler: TaskConfigAssembler,
    workflowMediaResolver: WorkflowMediaResolver,
    private readonly workflowRunEventLog: WorkflowRunEventLog = new NoopWorkflowRunEventLog(),
  ) {
    this.runExecutor = new WorkflowRunExecutor(
      repositories,
      tasksService,
      taskConfigAssembler,
      workflowMediaResolver,
      workflowRunEventLog,
    )
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
    const executableNodeIds = scopeGroupNodeId
      ? this.flowGroupExecutableNodeIds(workflow, scopeGroupNodeId)
      : [selectedNode.id]
    const dependencies = scopeGroupNodeId
      ? this.deriveDependencies(workflow, scopeGroupNodeId, executableNodeIds)
      : []

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
      nodeStates: Object.fromEntries(executableNodeIds.map((nodeId) => [nodeId, { status: 'pending' as const }])),
      status: 'running',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
    }

    const created = await this.repositories.runs.createRunWithSnapshot({
      run: runRecordFromRun(run),
      snapshotNodes: run.snapshotNodes,
      snapshotEdges: run.snapshotEdges,
      executableNodeIds,
      dependencies: dependencies.map((dependency) => ({
        ...dependency,
        workflowRunId: run.id,
      })),
    })
    await this.recordWorkflowRunEvent(created, 'workflow.run.created', 'Workflow run was created.')
    return this.reconcileRun(created.id)
  }

  async cancelRun(runId: string): Promise<void> {
    const run = await this.getRun(runId)
    if (run.status !== 'running' && run.status !== 'queued') {
      throw new HttpError(409, 'WORKFLOW_RUN_NOT_CANCELLABLE', 'Only queued or running workflow runs can be cancelled.')
    }

    const cancelled = await this.repositories.runs.cancelRun(runId, nowIso())
    if (cancelled) {
      await this.workflowRunEventLog.record({
        eventType: 'workflow.run.cancelled',
        message: 'Workflow run was cancelled.',
        payload: workflowRunEventPayload({ ...run, status: 'cancelled' }),
        workflowRunId: run.id,
      })
    }
  }

  async getRun(runId: string): Promise<WorkflowRun> {
    const run = await this.repositories.runs.findRunById(runId)
    if (!run) {
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', 'Workflow run not found.')
    }
    return run
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return this.repositories.runs.listRuns(workflowId)
  }

  async reconcileRunningRuns(): Promise<WorkflowRun[]> {
    return this.runExecutor.reconcileRunningRuns()
  }

  async reconcileRun(runId: string): Promise<WorkflowRun> {
    return this.runExecutor.reconcileRun(runId)
  }

  private deriveDependencies(
    workflow: Workflow,
    scopeGroupNodeId: string,
    executableNodeIds: string[],
  ): Omit<WorkflowRunNodeDependency, 'workflowRunId'>[] {
    const nodeMap = getNodeMap(workflow.nodes)
    const executableIds = new Set(executableNodeIds)
    return sortNodesForExecution(
      workflow.nodes.filter(
        (node) => isExecutableNode(node) && isDescendantOf(node.id, scopeGroupNodeId, nodeMap),
      ),
    ).flatMap((node) =>
      nodeOutputDependenciesForNode(node, workflow.edges)
        .filter((sourceId) => executableIds.has(sourceId))
        .map((sourceId) => ({
          nodeId: node.id,
          dependsOnNodeId: sourceId,
        })),
    )
  }

  private flowGroupExecutableNodeIds(workflow: Workflow, scopeGroupNodeId: string): string[] {
    const nodeMap = getNodeMap(workflow.nodes)
    return sortNodesForExecution(
      workflow.nodes.filter(
        (node) => isExecutableNode(node) && isDescendantOf(node.id, scopeGroupNodeId, nodeMap),
      ),
    ).map((node) => node.id)
  }

  private async getWorkflow(id: string): Promise<Workflow> {
    const workflow = await this.repositories.definitions.findById(id)
    if (!workflow) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
    return workflow
  }

  private async preflightIsolatedNode(workflow: Workflow, node: WorkflowCanvasNode): Promise<void> {
    const nodeMap = getNodeMap(workflow.nodes)
    for (const item of mediaSlotItemsForNode(node, workflow.edges)) {
      if (!item.required) {
        continue
      }

      if (item.source.type === 'media_object' || item.source.type === 'external_url') {
        continue
      }

      if (item.source.resolve !== 'current_media') {
        throw new HttpError(
          422,
          'WORKFLOW_ISOLATED_RUN_OUTPUT_SELECTOR',
          'Ordinary canvas execution requires current media selectors.',
        )
      }

      const sourceNode = nodeMap.get(item.source.nodeId)
      if (!sourceNode || !isMediaWorkflowNode(sourceNode) || !sourceNode.data.mediaView?.taskId) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_MISSING', 'Required upstream MediaView output is missing.')
      }

      const output = await this.tasksService.getTaskOutput(sourceNode.data.mediaView.taskId)
      const resource = output
        ? findOutputByMediaView(output, sourceNode.data.mediaView.outputResourceId, sourceNode.data.mediaView.outputIndex)
        : undefined
      const expectedKind = slotToResourceKind(item.slot)
      if (!resource) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_MISSING', 'Required upstream MediaView output is missing.')
      }
      if (resource.kind !== expectedKind) {
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

import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { Task } from '@mina/contracts/modules/tasks'
import type {
  CreateWorkflowRunInput,
  Workflow,
  WorkflowSummary,
  WorkflowRun,
} from '@mina/contracts/modules/workflows'
import type { MinaLocale } from '@mina/i18n'

import { HttpError } from '../../lib/http/http-error'
import { localizeErrorDetails } from '../../lib/http/localized-error'
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
type WorkflowSnapshotInput = WorkflowSummary & Pick<Workflow, 'edges' | 'nodes'>

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

  async createRunFromSnapshot(
    workflow: WorkflowSnapshotInput,
    input: CreateWorkflowRunInput,
  ): Promise<WorkflowRun> {
    const nodeMap = getNodeMap(workflow.nodes)
    const selectedNode = nodeMap.get(input.selectedNodeId)
    if (!selectedNode) {
      throw new HttpError(404, 'WORKFLOW_NODE_NOT_FOUND', {
        fallbackMessage: 'Selected workflow node not found.',
        messageKey: 'api_error_workflow_node_not_found',
      })
    }
    if (selectedNode.data.nodeType !== 'flow_group' && !isExecutableNode(selectedNode)) {
      throw new HttpError(422, 'WORKFLOW_NODE_NOT_EXECUTABLE', {
        fallbackMessage: 'Selected workflow node is not executable.',
        messageKey: 'api_error_workflow_node_not_executable',
      })
    }

    const target = this.resolveRunTarget(workflow, selectedNode)
    const scopeGroupNodeId = target.scopeGroupNodeId
    const executableNodeIds = target.executableNodeIds
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
      throw new HttpError(409, 'WORKFLOW_RUN_NOT_CANCELLABLE', {
        fallbackMessage: 'Only queued or running workflow runs can be cancelled.',
        messageKey: 'api_error_workflow_run_not_cancellable',
      })
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
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', {
        fallbackMessage: 'Workflow run not found.',
        messageKey: 'api_error_workflow_run_not_found',
      })
    }
    return run
  }

  async getTask(accountId: string, taskId: string): Promise<Task> {
    return this.tasksService.getTaskForAccount(accountId, taskId)
  }

  async getTaskLocalized(accountId: string, taskId: string, locale: MinaLocale): Promise<Task> {
    return this.tasksService.getTaskForAccountLocalized(accountId, taskId, locale)
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return this.repositories.runs.listRuns(workflowId)
  }

  async listRunsLocalized(workflowId: string | undefined, locale: MinaLocale): Promise<WorkflowRun[]> {
    return (await this.listRuns(workflowId)).map((run) => this.localizeRun(run, locale))
  }

  localizeRun(run: WorkflowRun, locale: MinaLocale): WorkflowRun {
    return {
      ...run,
      ...(run.error ? { error: localizeErrorDetails(run.error, locale) } : {}),
      nodeStates: Object.fromEntries(
        Object.entries(run.nodeStates).map(([nodeId, state]) => [
          nodeId,
          state.error
            ? {
                ...state,
                error: localizeErrorDetails(state.error, locale),
              }
            : state,
        ]),
      ),
    }
  }

  async reconcileRunningRuns(): Promise<WorkflowRun[]> {
    return this.runExecutor.reconcileRunningRuns()
  }

  async reconcileRun(runId: string): Promise<WorkflowRun> {
    return this.runExecutor.reconcileRun(runId)
  }

  private deriveDependencies(
    workflow: WorkflowSnapshotInput,
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

  private flowGroupExecutableNodeIds(workflow: WorkflowSnapshotInput, scopeGroupNodeId: string): string[] {
    const nodeMap = getNodeMap(workflow.nodes)
    return sortNodesForExecution(
      workflow.nodes.filter(
        (node) => isExecutableNode(node) && isDescendantOf(node.id, scopeGroupNodeId, nodeMap),
      ),
    ).map((node) => node.id)
  }

  private resolveRunTarget(
    workflow: WorkflowSnapshotInput,
    selectedNode: WorkflowCanvasNode,
  ): { executableNodeIds: string[]; scopeGroupNodeId?: string } {
    const nodeMap = getNodeMap(workflow.nodes)
    if (selectedNode.data.nodeType === 'flow_group') {
      return {
        scopeGroupNodeId: selectedNode.id,
        executableNodeIds: this.flowGroupExecutableNodeIds(workflow, selectedNode.id),
      }
    }

    const scopeGroupNodeId = findNearestFlowGroupId(selectedNode.id, nodeMap)
    if (!scopeGroupNodeId) {
      return { executableNodeIds: [selectedNode.id] }
    }

    return {
      scopeGroupNodeId,
      executableNodeIds: this.upstreamClosureNodeIds(workflow, scopeGroupNodeId, selectedNode.id),
    }
  }

  private upstreamClosureNodeIds(workflow: WorkflowSnapshotInput, scopeGroupNodeId: string, targetNodeId: string): string[] {
    const nodeMap = getNodeMap(workflow.nodes)
    const scopedExecutableIds = new Set(
      workflow.nodes
        .filter((node) => isExecutableNode(node) && isDescendantOf(node.id, scopeGroupNodeId, nodeMap))
        .map((node) => node.id),
    )
    const closure = new Set<string>()
    const visit = (nodeId: string): void => {
      if (closure.has(nodeId) || !scopedExecutableIds.has(nodeId)) {
        return
      }
      closure.add(nodeId)
      const node = nodeMap.get(nodeId)
      if (!node) {
        return
      }
      for (const sourceId of nodeOutputDependenciesForNode(node, workflow.edges)) {
        visit(sourceId)
      }
    }
    visit(targetNodeId)
    return sortNodesForExecution(workflow.nodes.filter((node) => closure.has(node.id))).map((node) => node.id)
  }

  private async preflightIsolatedNode(workflow: WorkflowSnapshotInput, node: WorkflowCanvasNode): Promise<void> {
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
          {
            fallbackMessage: 'Ordinary canvas execution requires current media selectors.',
            messageKey: 'api_error_workflow_isolated_run_output_selector',
          },
        )
      }

      const sourceNode = nodeMap.get(item.source.nodeId)
      if (!sourceNode || !isMediaWorkflowNode(sourceNode) || !sourceNode.data.mediaView?.taskId) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_MISSING', {
          fallbackMessage: 'Required upstream MediaView output is missing.',
          messageKey: 'api_error_workflow_upstream_output_missing',
        })
      }

      const output = await this.tasksService.getTaskOutputForAccount(workflow.accountId, sourceNode.data.mediaView.taskId)
      const resource = output
        ? findOutputByMediaView(output, sourceNode.data.mediaView.outputResourceId, sourceNode.data.mediaView.outputIndex)
        : undefined
      const expectedKind = slotToResourceKind(item.slot)
      if (!resource) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_MISSING', {
          fallbackMessage: 'Required upstream MediaView output is missing.',
          messageKey: 'api_error_workflow_upstream_output_missing',
        })
      }
      if (resource.kind !== expectedKind) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_KIND_MISMATCH', {
          fallbackMessage: 'Upstream output kind does not match target slot.',
          messageKey: 'api_error_workflow_upstream_output_kind_mismatch',
        })
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

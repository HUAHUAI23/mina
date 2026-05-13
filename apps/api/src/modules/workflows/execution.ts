import type {
  MediaInput,
  MediaSlotConnection,
  NodeOutputResource,
  ResourceRef,
  TaskConfig,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowRun,
  WorkflowRunNodeState,
} from '@mina/contracts'

import { HttpError } from '../../lib/http/http-error'
import type { TasksService } from '../tasks/tasks.service'
import {
  getExecutablePredecessors,
  getIncomingEdges,
  getNodeMap,
  isDescendantOf,
  isExecutableNode,
  isMediaWorkflowNode,
  sortNodesForExecution,
} from './graph'
import {
  buildImageTaskConfig,
  buildVideoTaskConfig,
  collectInputResources,
  findOutputByMediaView,
  findOutputBySelector,
  isNodeOutputResource,
  mediaInputFromOutput,
  mediaInputFromResourceRef,
  type ResolvedMediaInput,
  slotToInputRole,
  slotToResourceKind,
} from './media'
import { NoopWorkflowRunEventLog, workflowRunEventPayload, type WorkflowRunEventLog } from './workflow-events'
import type { WorkflowRepository } from './workflows.repository'

const nowIso = (): string => new Date().toISOString()

interface ExecuteNodeResult {
  run: WorkflowRun
  progressed: boolean
}

export const createInitialNodeStates = (
  nodes: WorkflowCanvasNode[],
  selectedNodeId: string,
  scopeGroupNodeId: string | undefined,
): Record<string, WorkflowRunNodeState> => {
  if (!scopeGroupNodeId) {
    return {
      [selectedNodeId]: {
        status: 'pending',
      },
    }
  }

  const nodeMap = getNodeMap(nodes)
  return Object.fromEntries(
    nodes
      .filter((node) => isExecutableNode(node) && isDescendantOf(node.id, scopeGroupNodeId, nodeMap))
      .map((node) => [node.id, { status: 'pending' as const }]),
  )
}

export class WorkflowRunExecutor {
  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly tasksService: TasksService,
    private readonly workflowRunEventLog: WorkflowRunEventLog = new NoopWorkflowRunEventLog(),
  ) {}

  async reconcileRunningRuns(): Promise<WorkflowRun[]> {
    const runningRuns = await this.workflowRepository.listRunsByStatus('running')
    const reconciled: WorkflowRun[] = []
    for (const run of runningRuns) {
      reconciled.push(await this.reconcileRun(run.id))
    }
    return reconciled
  }

  async reconcileRun(runId: string): Promise<WorkflowRun> {
    let run = await this.getRun(runId)
    if (run.status !== 'running') {
      return run
    }

    if (run.runMode === 'isolated_node') {
      const node = getNodeMap(run.snapshotNodes).get(run.selectedNodeId)
      if (!node) {
        return this.failRun(run, 'Selected node does not exist in the workflow snapshot.')
      }
      const result = await this.executeNode(run, node)
      run = result.run
      return this.finishRunIfSettled(run)
    }

    return this.reconcileFlowGroupRun(run)
  }

  private async getRun(runId: string): Promise<WorkflowRun> {
    const run = await this.workflowRepository.findRunById(runId)
    if (!run) {
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', 'Workflow run not found.')
    }
    return run
  }

  private async executeNode(run: WorkflowRun, node: WorkflowCanvasNode): Promise<ExecuteNodeResult> {
    const currentState = run.nodeStates[node.id]
    if (currentState?.status === 'succeeded') {
      return { run, progressed: false }
    }

    if (currentState?.status === 'running' && currentState.taskId) {
      const task = await this.tasksService.getTask(currentState.taskId)
      if (task.status === 'succeeded' && task.output) {
        const nextRun = await this.workflowRepository.updateRunNodeState(run.id, node.id, {
          ...currentState,
          status: 'succeeded',
          output: task.output,
          completedAt: nowIso(),
        })
        await this.recordWorkflowRunEvent(nextRun, 'workflow.node.succeeded', 'Workflow node completed successfully.', {
          nodeId: node.id,
          outputResourceCount: task.output.resources.length,
          taskId: task.id,
        })
        return { run: nextRun, progressed: true }
      }

      if (task.status === 'failed' || task.status === 'cancelled') {
        const failedRun = await this.failRun(run, `Task ${task.id} ended with status ${task.status}.`, node.id)
        return { run: failedRun, progressed: true }
      }

      return { run, progressed: false }
    }

    try {
      const taskConfig = await this.buildTaskConfigForNode(run, node)
      const inputResources = collectInputResources(taskConfig)
      const task = await this.tasksService.createTask({
        accountId: run.accountId,
        config: taskConfig,
        inputResources,
      })
      await this.workflowRepository.linkNodeTask({
        workflowRunId: run.id,
        nodeId: node.id,
        taskId: task.id,
      })
      await this.recordWorkflowRunEvent(run, 'workflow.node.task_created', 'Workflow node task was created.', {
        inputResourceCount: inputResources.length,
        nodeId: node.id,
        taskId: task.id,
      })

      let nextRun = await this.workflowRepository.updateRunNodeState(run.id, node.id, {
        status: 'running',
        taskId: task.id,
        startedAt: nowIso(),
      })
      await this.recordWorkflowRunEvent(nextRun, 'workflow.node.started', 'Workflow node started running.', {
        nodeId: node.id,
        taskId: task.id,
      })

      return { run: nextRun, progressed: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow node execution failed.'
      const failedRun = await this.failRun(run, message, node.id)
      return { run: failedRun, progressed: true }
    }
  }

  private async reconcileFlowGroupRun(initialRun: WorkflowRun): Promise<WorkflowRun> {
    let run = initialRun
    const nodeMap = getNodeMap(run.snapshotNodes)
    const scopedNodes = sortNodesForExecution(
      run.snapshotNodes.filter(
        (node) =>
          isExecutableNode(node) &&
          run.scopeGroupNodeId !== undefined &&
          isDescendantOf(node.id, run.scopeGroupNodeId, nodeMap),
      ),
    )
    const scopedNodeIds = new Set(scopedNodes.map((node) => node.id))
    const scopedEdges = run.snapshotEdges.filter(
      (edge) => scopedNodeIds.has(edge.source) && scopedNodeIds.has(edge.target),
    )

    let progressed = true
    while (progressed && run.status === 'running') {
      progressed = false

      for (const node of scopedNodes) {
        const state = run.nodeStates[node.id]
        if (!state || state.status === 'succeeded' || state.status === 'failed') {
          continue
        }

        if (state.status === 'running') {
          const result = await this.executeNode(run, node)
          run = result.run
          progressed = progressed || result.progressed
          continue
        }

        const predecessors = getExecutablePredecessors(node.id, scopedEdges, nodeMap)
        const allPredecessorsSucceeded = predecessors.every(
          (predecessor) => run.nodeStates[predecessor.id]?.status === 'succeeded',
        )

        if (!allPredecessorsSucceeded) {
          continue
        }

        const result = await this.executeNode(run, node)
        run = result.run
        progressed = progressed || result.progressed
      }
    }

    return this.finishRunIfSettled(run)
  }

  private async buildTaskConfigForNode(run: WorkflowRun, node: WorkflowCanvasNode): Promise<TaskConfig> {
    if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
      throw new Error('Node is not executable.')
    }
    if (!node.data.config.task) {
      throw new Error('Executable node is missing task config.')
    }

    const inputs = await this.resolveIncomingMediaInputs(run, node)
    if (node.data.nodeType === 'image_generation') {
      return buildImageTaskConfig(
        node.data.config.task,
        inputs.filter((item) => item.targetSlot === 'inputImages').map((item) => item.input),
      )
    }

    if (node.data.config.task.kind !== 'video_generation') {
      throw new Error('Video node task config is invalid.')
    }

    const inputsBySlot = inputs.reduce<Partial<Record<MediaSlotConnection['targetSlot'], MediaInput[]>>>(
      (accumulator, item) => ({
        ...accumulator,
        [item.targetSlot]: [...(accumulator[item.targetSlot] ?? []), item.input],
      }),
      {},
    )
    return buildVideoTaskConfig(node.data.config.task, inputsBySlot)
  }

  private async resolveIncomingMediaInputs(run: WorkflowRun, node: WorkflowCanvasNode): Promise<ResolvedMediaInput[]> {
    const incomingEdges = getIncomingEdges(node.id, run.snapshotEdges)
    const inputs: ResolvedMediaInput[] = []

    for (const edge of incomingEdges) {
      const resolved = await this.resolveEdgeMediaInput(run, edge)
      if (resolved) {
        inputs.push(resolved)
      }
    }

    return inputs
  }

  private async resolveEdgeMediaInput(run: WorkflowRun, edge: WorkflowCanvasEdge): Promise<ResolvedMediaInput | null> {
    const { connection } = edge.data
    if (connection.sourceSelector.mode === 'empty') {
      return null
    }
    if (connection.targetSlot === 'prompt') {
      return null
    }

    const expectedKind = slotToResourceKind(connection.targetSlot)
    const inputRole = slotToInputRole(connection.targetSlot)
    let resource: NodeOutputResource | ResourceRef | undefined
    let source: MediaInput['source']

    if (connection.sourceSelector.mode === 'asset') {
      resource = connection.sourceSelector.resource
    } else if (connection.sourceSelector.mode === 'run_output') {
      const sourceState = run.nodeStates[edge.source]
      resource = sourceState?.output
        ? findOutputBySelector(
            sourceState.output,
            connection.sourceSelector.resourceKind,
            connection.sourceSelector.role,
            connection.sourceSelector.index,
          )
        : undefined
      source = {
        workflowId: run.workflowId,
        workflowRunId: run.id,
        nodeId: edge.source,
        ...(sourceState?.taskId ? { taskId: sourceState.taskId } : {}),
        ...(resource?.id ? { outputResourceId: resource.id } : {}),
        ...(resource?.index !== undefined ? { outputIndex: resource.index } : {}),
      }
    } else {
      const sourceNode = getNodeMap(run.snapshotNodes).get(edge.source)
      if (!sourceNode || !isMediaWorkflowNode(sourceNode) || !sourceNode.data.mediaView?.taskId) {
        return this.handleMissingMedia(connection, 'Source node has no current MediaView output.')
      }

      const output = await this.tasksService.getTaskOutput(sourceNode.data.mediaView.taskId)
      resource = output
        ? findOutputByMediaView(output, sourceNode.data.mediaView.outputResourceId, sourceNode.data.mediaView.outputIndex)
        : undefined
      source = {
        workflowId: run.workflowId,
        nodeId: edge.source,
        taskId: sourceNode.data.mediaView.taskId,
        ...(resource?.id ? { outputResourceId: resource.id } : {}),
        ...(resource?.index !== undefined ? { outputIndex: resource.index } : {}),
      }
    }

    if (!resource) {
      return this.handleMissingMedia(connection, 'Required upstream output is missing.')
    }
    if (expectedKind && resource.kind !== expectedKind) {
      throw new Error(`Upstream output kind "${resource.kind}" cannot be used for slot "${connection.targetSlot}".`)
    }

    return {
      targetSlot: connection.targetSlot,
      input: isNodeOutputResource(resource)
        ? mediaInputFromOutput(resource, inputRole, source)
        : mediaInputFromResourceRef(resource, inputRole),
    }
  }

  private handleMissingMedia(connection: MediaSlotConnection, message: string): null {
    if (!connection.required) {
      return null
    }
    throw new Error(message)
  }

  private async finishRunIfSettled(run: WorkflowRun): Promise<WorkflowRun> {
    if (run.status !== 'running') {
      return run
    }

    const states = Object.values(run.nodeStates)
    if (states.length > 0 && states.every((state) => state.status === 'succeeded' || state.status === 'skipped')) {
      const succeeded = await this.workflowRepository.updateRun({
        ...run,
        status: 'succeeded',
        completedAt: nowIso(),
        updatedAt: nowIso(),
      })
      await this.recordWorkflowRunEvent(succeeded, 'workflow.run.succeeded', 'Workflow run completed successfully.')
      return succeeded
    }

    if (states.some((state) => state.status === 'failed')) {
      const failed = await this.workflowRepository.updateRun({
        ...run,
        status: 'failed',
        completedAt: nowIso(),
        updatedAt: nowIso(),
      })
      await this.recordWorkflowRunEvent(failed, 'workflow.run.failed', 'Workflow run failed.', {
        error: failed.error ?? 'One or more workflow nodes failed.',
      })
      return failed
    }

    return run
  }

  private async failRun(run: WorkflowRun, message: string, nodeId?: string): Promise<WorkflowRun> {
    const failedAt = nowIso()
    const failedNodeStates =
      nodeId && run.nodeStates[nodeId]
        ? {
            ...run.nodeStates,
            [nodeId]: {
              ...run.nodeStates[nodeId],
              status: 'failed' as const,
              error: message,
              completedAt: failedAt,
            },
          }
        : run.nodeStates

    const failed = await this.workflowRepository.updateRun({
      ...run,
      nodeStates: failedNodeStates,
      status: 'failed',
      error: message,
      completedAt: failedAt,
      updatedAt: failedAt,
    })
    if (nodeId) {
      await this.recordWorkflowRunEvent(failed, 'workflow.node.failed', message, {
        nodeId,
      })
    }
    await this.recordWorkflowRunEvent(failed, 'workflow.run.failed', message, {
      ...(nodeId ? { nodeId } : {}),
    })
    return failed
  }

  private async recordWorkflowRunEvent(
    run: WorkflowRun,
    eventType: string,
    message: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.workflowRunEventLog.record({
      eventType,
      message,
      ...(typeof payload.nodeId === 'string' ? { nodeId: payload.nodeId } : {}),
      payload: {
        ...workflowRunEventPayload(run),
        ...payload,
      },
      workflowRunId: run.id,
    })
  }
}

import type {
  MediaInput,
  NodeOutputResource,
  ResourceRef,
  TaskConfig,
} from '@mina/contracts/modules/tasks'
import type { MediaSlotConnection, WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { WorkflowRun } from '@mina/contracts/modules/workflows'

import type { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import type { TasksService } from '../tasks/tasks.service'
import { getIncomingEdges, getNodeMap, isMediaWorkflowNode } from './graph'
import {
  findOutputByMediaView,
  findOutputBySelector,
  isNodeOutputResource,
  mediaInputFromOutput,
  mediaInputFromResourceRef,
  type ResolvedMediaInput,
  slotToInputRole,
  slotToResourceKind,
} from './media-selection'
import { workflowNodeRunningState, workflowNodeSucceededState } from './run-state'
import { buildMediaEnvelope } from './task-config'
import { workflowRunEventPayload, type WorkflowRunEventLog } from './workflow-events'
import type { WorkflowRepository } from './workflows.repository'

export interface ExecuteNodeResult {
  run: WorkflowRun
  progressed: boolean
}

interface WorkflowNodeExecutorDependencies {
  failRun(run: WorkflowRun, message: string, nodeId?: string): Promise<WorkflowRun>
  taskConfigAssembler: TaskConfigAssembler
  tasksService: TasksService
  workflowRepository: WorkflowRepository
  workflowRunEventLog: WorkflowRunEventLog
}

export class WorkflowNodeExecutor {
  constructor(private readonly dependencies: WorkflowNodeExecutorDependencies) {}

  async executeNode(run: WorkflowRun, node: WorkflowCanvasNode): Promise<ExecuteNodeResult> {
    const currentState = run.nodeStates[node.id]
    if (currentState?.status === 'succeeded') {
      return { run, progressed: false }
    }

    if (currentState?.status === 'running' && currentState.taskId) {
      const task = await this.dependencies.tasksService.getTask(currentState.taskId)
      if (task.status === 'succeeded' && task.output) {
        const nextRun = await this.dependencies.workflowRepository.updateRunNodeState(
          run.id,
          node.id,
          workflowNodeSucceededState(currentState, task.output),
        )
        await this.recordWorkflowRunEvent(nextRun, 'workflow.node.succeeded', 'Workflow node completed successfully.', {
          nodeId: node.id,
          outputResourceCount: task.output.resources.length,
          taskId: task.id,
        })
        return { run: nextRun, progressed: true }
      }

      if (task.status === 'failed' || task.status === 'cancelled') {
        const failedRun = await this.dependencies.failRun(run, `Task ${task.id} ended with status ${task.status}.`, node.id)
        return { run: failedRun, progressed: true }
      }

      return { run, progressed: false }
    }

    try {
      const taskConfig = await this.buildTaskConfigForNode(run, node)
      const task = await this.dependencies.tasksService.createTask({
        accountId: run.accountId,
        config: taskConfig,
      })
      await this.dependencies.workflowRepository.linkNodeTask({
        workflowRunId: run.id,
        nodeId: node.id,
        taskId: task.id,
      })
      const inputResourceCount = (await this.dependencies.tasksService.listTaskResources(task.id)).filter(
        (resource) => resource.direction === 'input',
      ).length
      await this.recordWorkflowRunEvent(run, 'workflow.node.task_created', 'Workflow node task was created.', {
        inputResourceCount,
        nodeId: node.id,
        taskId: task.id,
      })

      const nextRun = await this.dependencies.workflowRepository.updateRunNodeState(
        run.id,
        node.id,
        workflowNodeRunningState(task.id),
      )
      await this.recordWorkflowRunEvent(nextRun, 'workflow.node.started', 'Workflow node started running.', {
        nodeId: node.id,
        taskId: task.id,
      })

      return { run: nextRun, progressed: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow node execution failed.'
      const failedRun = await this.dependencies.failRun(run, message, node.id)
      return { run: failedRun, progressed: true }
    }
  }

  private async buildTaskConfigForNode(run: WorkflowRun, node: WorkflowCanvasNode): Promise<TaskConfig> {
    if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
      throw new Error('Node is not executable.')
    }
    if (!node.data.config.task) {
      throw new Error('Executable node is missing task config.')
    }
    if (node.data.config.task.kind !== node.data.nodeType) {
      throw new Error('Executable node task kind does not match node type.')
    }

    const inputs = await this.resolveIncomingMediaInputs(run, node)
    const inputsBySlot = inputs.reduce<Partial<Record<MediaSlotConnection['targetSlot'], MediaInput[]>>>(
      (accumulator, item) => ({
        ...accumulator,
        [item.targetSlot]: [...(accumulator[item.targetSlot] ?? []), item.input],
      }),
      {},
    )
    return this.dependencies.taskConfigAssembler.prepare({
      draft: node.data.config.task,
      media: buildMediaEnvelope(inputsBySlot),
    })
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

      const output = await this.dependencies.tasksService.getTaskOutput(sourceNode.data.mediaView.taskId)
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

  private async recordWorkflowRunEvent(
    run: WorkflowRun,
    eventType: string,
    message: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.dependencies.workflowRunEventLog.record({
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

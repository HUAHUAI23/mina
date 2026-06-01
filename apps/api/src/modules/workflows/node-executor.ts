import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { MediaSlotName } from '@mina/contracts/modules/media'
import type { MediaInput, TaskConfig } from '@mina/contracts/modules/tasks'
import type { ApiErrorMessageKey } from '@mina/i18n'

import { createLocalizedErrorDetails, localizedErrorFromUnknown } from '../../lib/http/localized-error'
import type { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import type { TasksService } from '../tasks/tasks.service'
import type { WorkflowMediaResolver } from './media/workflow-media-resolver'
import type { WorkflowNodeTaskRepository } from './repositories/workflow-node-task.repository'
import type { WorkflowRunNodeStateRepository } from './repositories/workflow-run-node-state.repository'
import type { WorkflowRunRecord } from './repositories/workflow-types'
import { buildMediaEnvelope } from './task-config'
import { workflowRunEventPayload, type WorkflowRunEventLog } from './workflow-events'
import {
  NoopWorkflowRunEventPublisher,
  type WorkflowRunEventPublisher,
} from './workflow-run-event-publisher'

export interface StartNodeInput {
  edges: WorkflowCanvasEdge[]
  getSourceNode(nodeId: string): Promise<WorkflowCanvasNode | undefined>
  node: WorkflowCanvasNode
  run: WorkflowRunRecord
}

export interface StartNodeResult {
  error?: string
  progressed: boolean
}

interface WorkflowNodeExecutorDependencies {
  eventPublisher?: WorkflowRunEventPublisher
  nodeStates: WorkflowRunNodeStateRepository
  nodeTasks: WorkflowNodeTaskRepository
  taskConfigAssembler: TaskConfigAssembler
  tasksService: TasksService
  workflowMediaResolver: WorkflowMediaResolver
  workflowRunEventLog: WorkflowRunEventLog
}

export class WorkflowNodeExecutor {
  private readonly eventPublisher: WorkflowRunEventPublisher

  constructor(private readonly dependencies: WorkflowNodeExecutorDependencies) {
    this.eventPublisher = dependencies.eventPublisher ?? new NoopWorkflowRunEventPublisher()
  }

  async observeRunningNode(input: {
    node: WorkflowCanvasNode
    run: WorkflowRunRecord
    taskId: string
  }): Promise<StartNodeResult> {
    const task = await this.dependencies.tasksService.getTask(input.taskId)
    const timestamp = new Date().toISOString()
    if (task.status === 'succeeded' && task.output) {
      const updated = await this.dependencies.nodeStates.markNodeSucceeded({
        workflowRunId: input.run.id,
        nodeId: input.node.id,
        taskId: task.id,
        output: task.output,
        completedAt: timestamp,
      })
      if (!updated) {
        return { progressed: false }
      }
      await this.recordWorkflowRunEvent(input.run, 'workflow.node.succeeded', 'Workflow node completed successfully.', {
        nodeId: input.node.id,
        outputResourceCount: task.output.resources.length,
        taskId: task.id,
      })
      this.eventPublisher.publishNodeTaskStatus({
        nodeId: input.node.id,
        run: input.run,
        status: 'succeeded',
        taskCreatedAt: task.createdAt,
        taskId: task.id,
        taskUpdatedAt: task.updatedAt,
      })
      return { progressed: true }
    }

    if (task.status === 'failed' || task.status === 'cancelled') {
      const message = `Task ${task.id} ended with status ${task.status}.`
      const error = createLocalizedErrorDetails({
        code: task.error?.code ?? 'WORKFLOW_NODE_FAILED',
        debugMessage: task.error?.debugMessage ?? message,
        fallbackMessage: task.error?.message ?? message,
        messageKey: (task.error?.messageKey as ApiErrorMessageKey | undefined) ?? 'api_error_workflow_node_failed',
        ...(task.error?.params ? { params: task.error.params } : {}),
      })
      const updated = await this.dependencies.nodeStates.markNodeFailed({
        workflowRunId: input.run.id,
        nodeId: input.node.id,
        taskId: task.id,
        error,
        completedAt: timestamp,
      })
      if (!updated) {
        return { progressed: false }
      }
      await this.recordWorkflowRunEvent(input.run, 'workflow.node.failed', message, {
        nodeId: input.node.id,
        taskId: task.id,
      })
      this.eventPublisher.publishNodeTaskStatus({
        nodeId: input.node.id,
        run: input.run,
        status: task.status,
        taskCreatedAt: task.createdAt,
        taskId: task.id,
        taskUpdatedAt: task.updatedAt,
      })
      return { error: error.message, progressed: true }
    }

    return { progressed: false }
  }

  async startNode(input: StartNodeInput): Promise<StartNodeResult> {
    try {
      const canStart = await this.dependencies.nodeStates.tryMarkNodeStarting({
        workflowRunId: input.run.id,
        nodeId: input.node.id,
      })
      if (!canStart) {
        return { progressed: false }
      }

      const taskConfig = await this.buildTaskConfigForNode(input)
      const task = await this.dependencies.tasksService.createTask({
        accountId: input.run.accountId,
        config: taskConfig,
        idempotencyKey: `workflow_run:${input.run.id}:node:${input.node.id}`,
      })
      await this.dependencies.nodeTasks.linkNodeTask({
        workflowRunId: input.run.id,
        nodeId: input.node.id,
        taskId: task.id,
      })

      const startedAt = new Date().toISOString()
      const marked = await this.dependencies.nodeStates.markNodeRunning({
        workflowRunId: input.run.id,
        nodeId: input.node.id,
        taskId: task.id,
        startedAt,
      })
      if (!marked) {
        return { progressed: false }
      }

      const inputResourceCount = (await this.dependencies.tasksService.listTaskResources(task.id)).filter(
        (resource) => resource.direction === 'input',
      ).length
      await this.recordWorkflowRunEvent(input.run, 'workflow.node.task_created', 'Workflow node task was created.', {
        inputResourceCount,
        nodeId: input.node.id,
        taskId: task.id,
      })
      await this.recordWorkflowRunEvent(input.run, 'workflow.node.started', 'Workflow node started running.', {
        nodeId: input.node.id,
        taskId: task.id,
      })
      this.eventPublisher.publishNodeTaskStatus({
        nodeId: input.node.id,
        run: input.run,
        status: task.status,
        taskCreatedAt: task.createdAt,
        taskId: task.id,
        taskUpdatedAt: task.updatedAt,
      })

      return { progressed: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow node execution failed.'
      const details = localizedErrorFromUnknown('WORKFLOW_NODE_FAILED', error, 'Workflow node execution failed.', {
        messageKey: 'api_error_workflow_node_failed',
      })
      const updated = await this.dependencies.nodeStates.markNodeFailed({
        workflowRunId: input.run.id,
        nodeId: input.node.id,
        error: details,
        expectedStatus: 'pending',
        completedAt: new Date().toISOString(),
      })
      if (!updated) {
        return { progressed: false }
      }
      await this.recordWorkflowRunEvent(input.run, 'workflow.node.failed', message, {
        nodeId: input.node.id,
      })
      return { error: details.message, progressed: true }
    }
  }

  private async buildTaskConfigForNode(input: StartNodeInput): Promise<TaskConfig> {
    const { node, run } = input
    if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
      throw new Error('Node is not executable.')
    }
    if (!node.data.config.task) {
      throw new Error('Executable node is missing task config.')
    }
    if (node.data.config.task.kind !== node.data.nodeType) {
      throw new Error('Executable node task kind does not match node type.')
    }

    const inputs = await this.dependencies.workflowMediaResolver.resolveNodeMedia({
      node,
      edges: input.edges,
      getSourceNode: input.getSourceNode,
      getSourceNodeState: (nodeId) => this.dependencies.nodeStates.getNodeState(run.id, nodeId),
      run: {
        id: run.id,
        workflowId: run.workflowId,
        accountId: run.accountId,
        runMode: run.runMode,
      },
    })
    const inputsBySlot = inputs.reduce<Partial<Record<MediaSlotName, MediaInput[]>>>(
      (accumulator, item) => ({
        ...accumulator,
        [item.slot]: [...(accumulator[item.slot] ?? []), item.input],
      }),
      {},
    )
    return this.dependencies.taskConfigAssembler.prepare({
      draft: node.data.config.task,
      media: buildMediaEnvelope(inputsBySlot),
    })
  }

  private async recordWorkflowRunEvent(
    run: WorkflowRunRecord,
    eventType: string,
    message: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.dependencies.workflowRunEventLog.record({
      eventType,
      message,
      ...(typeof payload.nodeId === 'string' ? { nodeId: payload.nodeId } : {}),
      payload: {
        ...workflowRunEventPayload({
          ...run,
          snapshotNodes: [],
          snapshotEdges: [],
          nodeStates: {},
        }),
        ...payload,
      },
      workflowRunId: run.id,
    })
  }
}

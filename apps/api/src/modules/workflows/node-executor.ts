import type { MediaSlotName } from '@mina/contracts/modules/media'
import type { MediaInput, TaskConfig } from '@mina/contracts/modules/tasks'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { WorkflowRun } from '@mina/contracts/modules/workflows'

import type { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import type { TasksService } from '../tasks/tasks.service'
import type { WorkflowMediaResolver } from './media/workflow-media-resolver'
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
  workflowMediaResolver: WorkflowMediaResolver
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

    const inputs = await this.dependencies.workflowMediaResolver.resolveNodeMedia({ run, node })
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

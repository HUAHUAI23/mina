import type { TaskStatus } from '@mina/contracts/modules/tasks'
import type { WorkflowRunStatus } from '@mina/contracts/modules/workflows'

import { createWorkflowEventId, type WorkflowEventBus } from './workflow-event-bus'
import type { WorkflowRunRecord } from './repositories/workflow-types'

type WorkflowRunEventContext = Pick<WorkflowRunRecord, 'accountId' | 'workflowId' | 'workflowVersion'>
export type WorkflowRunEventTaskContext = WorkflowRunEventContext & {
  nodeId: string
  taskCreatedAt?: string | undefined
  taskId: string
  taskUpdatedAt?: string | undefined
}

/**
 * Publishes live run/node-task transitions onto the workflow event bus so connected
 * clients can project a real-time facts layer. This is intentionally separate from the
 * persisted {@link WorkflowRunEventLog} audit trail: one is durable history, the other is
 * ephemeral push. The executor owns these emissions, which is why this is threaded down
 * the run pipeline alongside the event log.
 */
export interface WorkflowRunEventPublisher {
  publishNodeTaskStatus(input: {
    nodeId: string
    run: WorkflowRunEventContext
    status: TaskStatus
    taskCreatedAt?: string | undefined
    taskId: string
    taskUpdatedAt?: string | undefined
  }): void
  publishRunStatus(input: {
    run: WorkflowRunEventContext
    runId: string
    status: WorkflowRunStatus
  }): void
}

export class NoopWorkflowRunEventPublisher implements WorkflowRunEventPublisher {
  publishNodeTaskStatus(): void {}
  publishRunStatus(): void {}
}

export class BusWorkflowRunEventPublisher implements WorkflowRunEventPublisher {
  constructor(private readonly bus: WorkflowEventBus) {}

  publishNodeTaskStatus(input: {
    nodeId: string
    run: WorkflowRunEventContext
    status: TaskStatus
    taskCreatedAt?: string | undefined
    taskId: string
    taskUpdatedAt?: string | undefined
  }): void {
    this.bus.publish({
      id: createWorkflowEventId(),
      type: 'workflow.node.task.updated',
      workflowId: input.run.workflowId,
      accountId: input.run.accountId,
      version: input.run.workflowVersion,
      createdAt: new Date().toISOString(),
      payload: {
        nodeId: input.nodeId,
        status: input.status,
        taskId: input.taskId,
        ...(input.taskCreatedAt ? { taskCreatedAt: input.taskCreatedAt } : {}),
        ...(input.taskUpdatedAt ? { taskUpdatedAt: input.taskUpdatedAt } : {}),
      },
    })
  }

  publishRunStatus(input: {
    run: WorkflowRunEventContext
    runId: string
    status: WorkflowRunStatus
  }): void {
    this.bus.publish({
      id: createWorkflowEventId(),
      type: 'workflow.run.updated',
      workflowId: input.run.workflowId,
      accountId: input.run.accountId,
      version: input.run.workflowVersion,
      createdAt: new Date().toISOString(),
      payload: { runId: input.runId, status: input.status },
    })
  }
}

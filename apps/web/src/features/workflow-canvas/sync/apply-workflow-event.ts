import type { QueryKey } from '@tanstack/react-query'
import type { TaskStatus } from '@mina/contracts/modules/tasks'
import type { WorkflowEvent } from '@mina/contracts/modules/workflows/events'

import { mediaKeys, taskKeys, workflowKeys } from '../api/workflow-keys'

/**
 * Side effects the projection needs. Kept as an interface so the reducer stays pure and unit
 * testable — the live hook binds these to the node-runtime store and the react-query client.
 */
export interface WorkflowEventEffects {
  applyNodeTaskStatus(input: {
    nodeId: string
    status: TaskStatus
    taskCreatedAt?: string | undefined
    taskId: string
    taskUpdatedAt?: string | undefined
  }): void
  invalidate(queryKey: QueryKey): void
}

/**
 * Projects a single workflow event onto the client facts layer + query caches. This is the one
 * place that translates the live event stream into local state, so the rules for "what a given
 * event means" live together and are easy to reason about.
 */
export const applyWorkflowEvent = (
  event: WorkflowEvent,
  ctx: { effects: WorkflowEventEffects; workflowId: string },
): void => {
  const { effects, workflowId } = ctx
  switch (event.type) {
    case 'workflow.node.task.updated': {
      effects.applyNodeTaskStatus({
        nodeId: event.payload.nodeId,
        status: event.payload.status,
        taskCreatedAt: event.payload.taskCreatedAt,
        taskId: event.payload.taskId,
        taskUpdatedAt: event.payload.taskUpdatedAt,
      })
      // Refresh the task itself (so previews pick up the finished output) and the node's history list.
      effects.invalidate(taskKeys.detail(event.payload.taskId))
      effects.invalidate(workflowKeys.nodeTasks(workflowId, event.payload.nodeId))
      return
    }
    case 'workflow.run.updated': {
      effects.invalidate(workflowKeys.runs(workflowId))
      return
    }
    case 'workflow.mediaObject.ready': {
      effects.invalidate(mediaKeys.detail(event.payload.mediaObjectId))
      return
    }
    // Definition changes flow through the Yjs document, which is the source of truth for the graph;
    // re-fetching the workflow detail here would fight that. Conflicts are surfaced elsewhere.
    case 'workflow.definition.updated':
    case 'workflow.node.mediaView.updated':
    case 'workflow.remote.conflict':
      return
  }
}

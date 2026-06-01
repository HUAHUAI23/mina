import type { QueryKey } from '@tanstack/react-query'

import { applyWorkflowEvent, type WorkflowEventEffects } from './apply-workflow-event'

const baseEvent = {
  id: 'evt_1',
  workflowId: 'wf_1',
  accountId: 'acc_1',
  createdAt: '2026-05-30T00:00:00.000Z',
}

interface RecordingEffects extends WorkflowEventEffects {
  nodeTaskStatuses: Array<{
    nodeId: string
    status: string
    taskCreatedAt?: string | undefined
    taskId: string
    taskUpdatedAt?: string | undefined
  }>
  invalidations: string[]
}

const createEffects = (): RecordingEffects => {
  const nodeTaskStatuses: RecordingEffects['nodeTaskStatuses'] = []
  const invalidations: string[] = []
  return {
    nodeTaskStatuses,
    invalidations,
    applyNodeTaskStatus: (input) => nodeTaskStatuses.push(input),
    invalidate: (queryKey: QueryKey) => invalidations.push(JSON.stringify(queryKey)),
  }
}

const taskEffects = createEffects()
applyWorkflowEvent(
  {
    ...baseEvent,
    type: 'workflow.node.task.updated',
    payload: {
      nodeId: 'n1',
      taskId: 'task_9',
      status: 'succeeded',
      taskCreatedAt: '2026-05-30T00:00:00.000Z',
      taskUpdatedAt: '2026-05-30T00:00:01.000Z',
    },
  },
  { effects: taskEffects, workflowId: 'wf_1' },
)
if (taskEffects.nodeTaskStatuses.length !== 1 || taskEffects.nodeTaskStatuses[0]?.taskId !== 'task_9') {
  throw new Error('A node task update should project onto the facts layer.')
}
if (taskEffects.nodeTaskStatuses[0]?.taskUpdatedAt !== '2026-05-30T00:00:01.000Z') {
  throw new Error('A node task update should preserve task timestamps for runtime ordering.')
}
if (!taskEffects.invalidations.includes(JSON.stringify(['tasks', 'detail', 'task_9']))) {
  throw new Error('A node task update should invalidate the task detail query.')
}
if (!taskEffects.invalidations.includes(JSON.stringify(['workflows', 'detail', 'wf_1', 'nodeTasks', 'n1']))) {
  throw new Error('A node task update should invalidate the node history query.')
}

const runEffects = createEffects()
applyWorkflowEvent(
  { ...baseEvent, type: 'workflow.run.updated', payload: { runId: 'run_1', status: 'succeeded' } },
  { effects: runEffects, workflowId: 'wf_1' },
)
if (runEffects.nodeTaskStatuses.length !== 0) {
  throw new Error('A run update should not touch the facts layer.')
}
if (!runEffects.invalidations.includes(JSON.stringify(['workflows', 'detail', 'wf_1', 'runs']))) {
  throw new Error('A run update should invalidate the run list query.')
}

const definitionEffects = createEffects()
applyWorkflowEvent(
  { ...baseEvent, type: 'workflow.definition.updated', payload: { changedEdgeIds: [], changedNodeIds: ['n1'] } },
  { effects: definitionEffects, workflowId: 'wf_1' },
)
if (definitionEffects.nodeTaskStatuses.length !== 0 || definitionEffects.invalidations.length !== 0) {
  throw new Error('Definition updates flow through Yjs and should be ignored here.')
}

console.log('apply-workflow-event checks passed')

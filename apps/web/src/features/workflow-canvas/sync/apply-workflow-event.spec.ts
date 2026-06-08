import { expect, test } from 'bun:test'
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

test('node task events project to runtime facts and invalidate task queries', () => {
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
  expect(taskEffects.nodeTaskStatuses).toHaveLength(1)
  expect(taskEffects.nodeTaskStatuses[0]?.taskId).toBe('task_9')
  expect(taskEffects.nodeTaskStatuses[0]?.taskUpdatedAt).toBe('2026-05-30T00:00:01.000Z')
  expect(taskEffects.invalidations).toContain(JSON.stringify(['tasks', 'detail', 'task_9']))
  expect(taskEffects.invalidations).toContain(JSON.stringify(['workflows', 'detail', 'wf_1', 'nodeTasks', 'n1']))
})

test('run events invalidate run queries without touching node facts', () => {
  const runEffects = createEffects()
  applyWorkflowEvent(
    { ...baseEvent, type: 'workflow.run.updated', payload: { runId: 'run_1', status: 'succeeded' } },
    { effects: runEffects, workflowId: 'wf_1' },
  )
  expect(runEffects.nodeTaskStatuses).toHaveLength(0)
  expect(runEffects.invalidations).toContain(JSON.stringify(['workflows', 'detail', 'wf_1', 'runs']))
})

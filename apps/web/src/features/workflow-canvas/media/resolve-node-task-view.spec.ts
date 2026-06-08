import { expect, test } from 'bun:test'

import { resolveNodeTaskView } from './resolve-node-task-view'

test('unpinned task view follows the latest runtime task', () => {
  expect(resolveNodeTaskView(undefined, { latestTaskId: 'task_2', taskStatuses: {} })).toEqual({
    isPinned: false,
    taskId: 'task_2',
  })
})

test('task view is empty without a pin or runtime task', () => {
  expect(resolveNodeTaskView(undefined, undefined)).toEqual({
    isPinned: false,
    taskId: undefined,
  })
})

test('explicit task pins win over latest runtime task', () => {
  expect(resolveNodeTaskView({ taskId: 'task_1', outputIndex: 0 }, { latestTaskId: 'task_2', taskStatuses: {} })).toEqual({
    isPinned: true,
    taskId: 'task_1',
  })
})

test('pins without task ids fall back to latest runtime task', () => {
  expect(resolveNodeTaskView({ outputIndex: 1 }, { latestTaskId: 'task_3', taskStatuses: {} })).toEqual({
    isPinned: false,
    taskId: 'task_3',
  })
})

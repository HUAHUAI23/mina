import { resolveNodeTaskView } from './resolve-node-task-view'

const followLatest = resolveNodeTaskView(undefined, { latestTaskId: 'task_2', taskStatuses: {} })
if (followLatest.isPinned || followLatest.taskId !== 'task_2') {
  throw new Error('An unpinned node should follow the latest runtime task.')
}

const empty = resolveNodeTaskView(undefined, undefined)
if (empty.isPinned || empty.taskId !== undefined) {
  throw new Error('With no pin and no runtime, there is no task to show.')
}

const pinned = resolveNodeTaskView({ taskId: 'task_1', outputIndex: 0 }, { latestTaskId: 'task_2', taskStatuses: {} })
if (!pinned.isPinned || pinned.taskId !== 'task_1') {
  throw new Error('An explicit pin should win over the latest task.')
}

const pinWithoutTask = resolveNodeTaskView({ outputIndex: 1 }, { latestTaskId: 'task_3', taskStatuses: {} })
if (pinWithoutTask.isPinned || pinWithoutTask.taskId !== 'task_3') {
  throw new Error('A pin without a taskId should fall back to following latest.')
}

console.log('resolve-node-task-view checks passed')

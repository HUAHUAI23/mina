import { useNodeRuntimeStore } from './node-runtime-store'

const store = useNodeRuntimeStore.getState()

store.reset()
store.applyNodeTaskStatus({
  nodeId: 'n1',
  status: 'queued',
  taskCreatedAt: '2026-05-30T00:00:00.000Z',
  taskId: 'task_1',
  taskUpdatedAt: '2026-05-30T00:00:00.000Z',
})
store.applyNodeTaskStatus({
  nodeId: 'n1',
  status: 'queued',
  taskCreatedAt: '2026-05-30T00:01:00.000Z',
  taskId: 'task_2',
  taskUpdatedAt: '2026-05-30T00:01:00.000Z',
})
const afterQueue = useNodeRuntimeStore.getState().byNodeId.n1
if (afterQueue?.latestTaskId !== 'task_2' || afterQueue.status !== 'queued') {
  throw new Error('A newly queued task should become the latest task.')
}

store.reset()
store.applyNodeTaskStatus({
  nodeId: 'n1',
  status: 'queued',
  taskCreatedAt: '2026-05-30T00:00:00.000Z',
  taskId: 'task_1',
  taskUpdatedAt: '2026-05-30T00:00:00.000Z',
})
store.applyNodeTaskStatus({
  nodeId: 'n1',
  status: 'running',
  taskCreatedAt: '2026-05-30T00:00:00.000Z',
  taskId: 'task_1',
  taskUpdatedAt: '2026-05-30T00:00:01.000Z',
})
store.applyNodeTaskStatus({
  nodeId: 'n1',
  status: 'succeeded',
  taskCreatedAt: '2026-05-30T00:00:00.000Z',
  taskId: 'task_1',
  taskUpdatedAt: '2026-05-30T00:00:02.000Z',
})
const afterLifecycle = useNodeRuntimeStore.getState().byNodeId.n1
if (afterLifecycle?.latestTaskId !== 'task_1' || afterLifecycle.status !== 'succeeded') {
  throw new Error('Status transitions on the latest task should be tracked without regressing it.')
}

store.reset()
store.applyNodeTaskStatus({
  nodeId: 'n1',
  status: 'queued',
  taskCreatedAt: '2026-05-30T00:00:00.000Z',
  taskId: 'task_1',
  taskUpdatedAt: '2026-05-30T00:00:00.000Z',
})
store.applyNodeTaskStatus({
  nodeId: 'n1',
  status: 'queued',
  taskCreatedAt: '2026-05-30T00:01:00.000Z',
  taskId: 'task_2',
  taskUpdatedAt: '2026-05-30T00:01:00.000Z',
})
store.applyNodeTaskStatus({
  nodeId: 'n1',
  status: 'succeeded',
  taskCreatedAt: '2026-05-30T00:00:00.000Z',
  taskId: 'task_1',
  taskUpdatedAt: '2026-05-30T00:02:00.000Z',
})
const afterLateStatus = useNodeRuntimeStore.getState().byNodeId.n1
if (afterLateStatus?.latestTaskId !== 'task_2' || afterLateStatus.taskStatuses.task_1 !== 'succeeded') {
  throw new Error('A late status for an older task must not hijack the latest task.')
}

store.reset()
store.applyNodeTaskStatus({
  nodeId: 'n1',
  status: 'queued',
  taskCreatedAt: '2026-05-30T00:00:00.000Z',
  taskId: 'live_task',
  taskUpdatedAt: '2026-05-30T00:00:00.000Z',
})
store.mergeServerRuntime([
  {
    nodeId: 'n1',
    latestTaskId: 'seed_task',
    latestTaskCreatedAt: '2026-05-30T00:01:00.000Z',
    status: 'succeeded',
    statusUpdatedAt: '2026-05-30T00:01:01.000Z',
  },
  {
    nodeId: 'n2',
    latestTaskId: 'seed_task_2',
    latestTaskCreatedAt: '2026-05-30T00:02:00.000Z',
    status: 'succeeded',
    statusUpdatedAt: '2026-05-30T00:02:01.000Z',
  },
])
const afterSeed = useNodeRuntimeStore.getState().byNodeId
if (afterSeed.n1?.latestTaskId !== 'seed_task' || afterSeed.n2?.latestTaskId !== 'seed_task_2') {
  throw new Error('Server runtime should catch clients up to newer latest tasks.')
}

store.mergeServerRuntime([
  {
    nodeId: 'n1',
    latestTaskId: 'older_task',
    latestTaskCreatedAt: '2026-05-29T00:00:00.000Z',
    status: 'succeeded',
    statusUpdatedAt: '2026-05-29T00:00:01.000Z',
  },
])
if (useNodeRuntimeStore.getState().byNodeId.n1?.latestTaskId !== 'seed_task') {
  throw new Error('Older server runtime snapshots must not regress the latest task.')
}

store.reset()

console.log('node-runtime-store checks passed')

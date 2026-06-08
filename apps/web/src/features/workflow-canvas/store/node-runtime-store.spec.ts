import { expect, test } from 'bun:test'

import { useNodeRuntimeStore } from './node-runtime-store'

test('newer queued tasks become the latest node runtime task', () => {
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

  expect(useNodeRuntimeStore.getState().byNodeId.n1?.latestTaskId).toBe('task_2')
  expect(useNodeRuntimeStore.getState().byNodeId.n1?.status).toBe('queued')
})

test('status transitions update the latest task without regressing it', () => {
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

  expect(useNodeRuntimeStore.getState().byNodeId.n1?.latestTaskId).toBe('task_1')
  expect(useNodeRuntimeStore.getState().byNodeId.n1?.status).toBe('succeeded')
})

test('late statuses for older tasks do not hijack latest task tracking', () => {
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
  store.applyNodeTaskStatus({
    nodeId: 'n1',
    status: 'succeeded',
    taskCreatedAt: '2026-05-30T00:00:00.000Z',
    taskId: 'task_1',
    taskUpdatedAt: '2026-05-30T00:02:00.000Z',
  })

  const afterLateStatus = useNodeRuntimeStore.getState().byNodeId.n1
  expect(afterLateStatus?.latestTaskId).toBe('task_2')
  expect(afterLateStatus?.taskStatuses.task_1).toBe('succeeded')
})

test('server runtime merges catch clients up without regressing to older snapshots', () => {
  const store = useNodeRuntimeStore.getState()
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

  expect(useNodeRuntimeStore.getState().byNodeId.n1?.latestTaskId).toBe('seed_task')
  expect(useNodeRuntimeStore.getState().byNodeId.n2?.latestTaskId).toBe('seed_task_2')

  store.mergeServerRuntime([
    {
      nodeId: 'n1',
      latestTaskId: 'older_task',
      latestTaskCreatedAt: '2026-05-29T00:00:00.000Z',
      status: 'succeeded',
      statusUpdatedAt: '2026-05-29T00:00:01.000Z',
    },
  ])
  expect(useNodeRuntimeStore.getState().byNodeId.n1?.latestTaskId).toBe('seed_task')

  store.reset()
})

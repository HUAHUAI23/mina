import { create } from 'zustand'
import type { TaskStatus } from '@mina/contracts/modules/tasks'
import type { WorkflowNodeRuntime } from '@mina/contracts/modules/workflows'

/**
 * Ephemeral, per-client "facts" about each media node: which task ran most recently and the
 * live status of tasks we have observed. This is intentionally NOT collaborative state — it is
 * projected from the workflow event stream (plus a seed from the workflow detail response) and
 * is eventually consistent on every client independently.
 *
 * The collaborative pin (node.data.mediaView, synced via Yjs) is a separate concern: it records
 * what a user deliberately selected. Node display resolves to `pin.taskId ?? runtime.latestTaskId`
 * (see resolveNodeTaskView), so an unpinned node always follows the latest task.
 */
export interface NodeRuntimeFacts {
  latestTaskCreatedAt?: string | undefined
  latestTaskId?: string | undefined
  status?: TaskStatus | undefined
  statusUpdatedAt?: string | undefined
  taskStatuses: Record<string, TaskStatus>
}

interface NodeRuntimeStore {
  byNodeId: Record<string, NodeRuntimeFacts>
  applyNodeTaskStatus(input: {
    nodeId: string
    status: TaskStatus
    taskCreatedAt?: string | undefined
    taskId: string
    taskUpdatedAt?: string | undefined
  }): void
  mergeServerRuntime(rows: readonly WorkflowNodeRuntime[]): void
  reset(): void
  seed(rows: readonly WorkflowNodeRuntime[]): void
}

const EMPTY_FACTS: NodeRuntimeFacts = { taskStatuses: {} }

const compareIso = (left: string | undefined, right: string | undefined): number => {
  if (!left && !right) return 0
  if (!left) return -1
  if (!right) return 1
  return left.localeCompare(right)
}

const shouldAdvanceLatest = (
  current: NodeRuntimeFacts | undefined,
  taskId: string,
  taskCreatedAt: string | undefined,
): boolean => {
  if (!current?.latestTaskId) return true
  if (current.latestTaskId === taskId) return true
  const compared = compareIso(taskCreatedAt, current.latestTaskCreatedAt)
  return compared > 0 || (compared === 0 && taskId > current.latestTaskId)
}

const shouldUpdateStatus = (
  current: NodeRuntimeFacts | undefined,
  taskId: string,
  statusUpdatedAt: string | undefined,
): boolean => {
  if (current?.latestTaskId !== taskId) return false
  return compareIso(statusUpdatedAt, current.statusUpdatedAt) >= 0
}

export const useNodeRuntimeStore = create<NodeRuntimeStore>((set) => ({
  byNodeId: {},
  applyNodeTaskStatus: ({ nodeId, status, taskCreatedAt, taskId, taskUpdatedAt }) =>
    set((state) => {
      const current = state.byNodeId[nodeId] ?? EMPTY_FACTS
      const advance = shouldAdvanceLatest(current, taskId, taskCreatedAt)
      const updateLatestStatus = advance || shouldUpdateStatus(current, taskId, taskUpdatedAt)
      if (current.taskStatuses[taskId] === status && !advance && !updateLatestStatus) {
        return state
      }
      const next: NodeRuntimeFacts = {
        latestTaskId: advance ? taskId : current.latestTaskId,
        latestTaskCreatedAt: advance ? taskCreatedAt : current.latestTaskCreatedAt,
        status: updateLatestStatus ? status : current.status,
        statusUpdatedAt: updateLatestStatus ? taskUpdatedAt : current.statusUpdatedAt,
        taskStatuses: { ...current.taskStatuses, [taskId]: status },
      }
      return { byNodeId: { ...state.byNodeId, [nodeId]: next } }
    }),
  mergeServerRuntime: (rows) =>
    set((state) => {
      const byNodeId = { ...state.byNodeId }
      for (const row of rows) {
        if (!row.latestTaskId) {
          continue
        }
        const current = byNodeId[row.nodeId] ?? EMPTY_FACTS
        const advance = shouldAdvanceLatest(current, row.latestTaskId, row.latestTaskCreatedAt)
        const updateLatestStatus = advance || shouldUpdateStatus(current, row.latestTaskId, row.statusUpdatedAt)
        if (!advance && !updateLatestStatus) {
          continue
        }
        byNodeId[row.nodeId] = {
          latestTaskCreatedAt: advance ? row.latestTaskCreatedAt : current.latestTaskCreatedAt,
          latestTaskId: advance ? row.latestTaskId : current.latestTaskId,
          status: updateLatestStatus ? row.status : current.status,
          statusUpdatedAt: updateLatestStatus ? row.statusUpdatedAt : current.statusUpdatedAt,
          taskStatuses: row.status
            ? { ...current.taskStatuses, [row.latestTaskId]: row.status }
            : current.taskStatuses,
        }
      }
      return { byNodeId }
    }),
  reset: () => set({ byNodeId: {} }),
  seed: (rows) => useNodeRuntimeStore.getState().mergeServerRuntime(rows),
}))

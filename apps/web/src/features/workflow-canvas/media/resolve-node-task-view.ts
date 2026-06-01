import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'

import type { NodeRuntimeFacts } from '../store/node-runtime-store'

export interface ResolvedNodeTaskView {
  /** True when the user has deliberately pinned a task; false when following the latest. */
  isPinned: boolean
  taskId: string | undefined
}

/**
 * Resolves which task a media node should display. The collaborative pin (mediaView, synced via
 * Yjs) wins when set; otherwise the node follows the latest task from the ephemeral facts layer.
 * This is the single rule that makes "default to latest, honour explicit selection" work, and it
 * is kept pure so it can be unit tested in isolation.
 */
export const resolveNodeTaskView = (
  pin: NodeMediaViewState | undefined,
  runtime: NodeRuntimeFacts | undefined,
): ResolvedNodeTaskView => {
  if (pin?.taskId) {
    return { isPinned: true, taskId: pin.taskId }
  }
  return { isPinned: false, taskId: runtime?.latestTaskId }
}

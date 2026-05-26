import { create } from 'zustand'

import { createDraftSlice } from './slices/draft-slice'
import { createGraphSlice } from './slices/graph-slice'
import { createHydrationSlice } from './slices/hydration-slice'
import { createMediaSlotsSlice } from './slices/media-slots-slice'
import { createRemoteSlice } from './slices/remote-slice'
import { createTaskConfigSlice } from './slices/task-config-slice'
import type { CanvasStore } from './store-types'

export const useCanvasStore = create<CanvasStore>((set, get, store) => ({
  ...createGraphSlice(set, get, store),
  ...createDraftSlice(set, get, store),
  ...createHydrationSlice(set, get, store),
  ...createMediaSlotsSlice(set, get, store),
  ...createRemoteSlice(set, get, store),
  ...createTaskConfigSlice(set, get, store),
}))

export const getCanvasSnapshot = () => {
  const state = useCanvasStore.getState()
  return {
    edges: state.edges,
    name: state.name,
    nodes: state.nodes,
    version: state.version,
    workflowId: state.workflowId,
  }
}

export type { CanvasStore } from './store-types'

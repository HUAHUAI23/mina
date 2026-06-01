import { create } from 'zustand'

interface ActiveVideoStore {
  activeNodeId: string | undefined
  play(nodeId: string): void
  stop(nodeId: string): void
}

export const useActiveVideoStore = create<ActiveVideoStore>((set) => ({
  activeNodeId: undefined,
  play: (nodeId) => set({ activeNodeId: nodeId }),
  stop: (nodeId) =>
    set((state) => (
      state.activeNodeId === nodeId
        ? { activeNodeId: undefined }
        : state
    )),
}))

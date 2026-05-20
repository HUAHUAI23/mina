import { create } from 'zustand'

export type NodePanelType = 'config'

export interface ActiveNodePanel {
  nodeId: string
  panel: NodePanelType
}

interface CanvasUiState {
  activeNodePanel: ActiveNodePanel | undefined
  selectedNodeIds: string[]
}

interface CanvasUiActions {
  closeNodePanel(): void
  openNodePanel(nodeId: string, panel: NodePanelType): void
  selectNodeIds(ids: string[]): void
}

type CanvasUiStore = CanvasUiState & CanvasUiActions

export const useCanvasUiStore = create<CanvasUiStore>((set) => ({
  activeNodePanel: undefined,
  closeNodePanel: () => set({ activeNodePanel: undefined }),
  openNodePanel: (nodeId, panel) => set({ activeNodePanel: { nodeId, panel } }),
  selectedNodeIds: [],
  selectNodeIds: (ids) => set({ selectedNodeIds: ids }),
}))

export const getCanvasUiSnapshot = () => useCanvasUiStore.getState()

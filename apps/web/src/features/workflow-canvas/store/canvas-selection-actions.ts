import { useCanvasUiStore } from './canvas-ui-store'

export const selectWorkflowCanvasNodes = (ids: readonly string[]): void => {
  const ui = useCanvasUiStore.getState()
  ui.selectNodeIds(ids)
  if (ids.length === 0) {
    ui.setDraftExpanded(false)
  }
}

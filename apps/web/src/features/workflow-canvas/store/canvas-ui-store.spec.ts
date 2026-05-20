import { useCanvasUiStore } from './canvas-ui-store'

useCanvasUiStore.setState({
  activeNodePanel: undefined,
  selectedNodeIds: [],
})

useCanvasUiStore.getState().openNodePanel('node_1', 'config')
useCanvasUiStore.getState().selectNodeIds([])

if (useCanvasUiStore.getState().activeNodePanel?.nodeId !== 'node_1') {
  throw new Error('Selection changes should not close the active config panel.')
}

useCanvasUiStore.getState().closeNodePanel()

if (useCanvasUiStore.getState().activeNodePanel) {
  throw new Error('Explicit close should close the active config panel.')
}

console.log('canvas ui store checks passed')

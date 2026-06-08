import { useEffect } from 'react'

import { useCanvasUiStore } from '../store/canvas-ui-store'
import { useFlowRenderStore } from '../render/flow-render-store'

export const useCanvasDevGlobals = (): void => {
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }
    window.__minaWorkflowCanvasUi = {
      get activeNodePanel() {
        return useCanvasUiStore.getState().activeNodePanel
      },
      get selectedNodeIds() {
        return useCanvasUiStore.getState().selectedNodeIds
      },
    }
    window.__minaWorkflowCanvasRender = {
      get nodes() {
        return useFlowRenderStore.getState().flowNodes.map((node) => ({
          height: node.height ?? node.measured?.height,
          id: node.id,
          parentId: node.parentId,
          position: node.position,
          type: node.type,
          width: node.width ?? node.measured?.width,
        }))
      },
    }
    return () => {
      delete window.__minaWorkflowCanvasRender
      delete window.__minaWorkflowCanvasUi
    }
  }, [])
}

declare global {
  interface Window {
    __minaWorkflowCanvasRender?: {
      nodes: Array<{
        height?: number | undefined
        id: string
        parentId?: string | undefined
        position: { x: number; y: number }
        type: string
        width?: number | undefined
      }>
    }
    __minaWorkflowCanvasUi?: {
      activeNodePanel: { nodeId: string; panel: string } | undefined
      selectedNodeIds: string[]
    }
  }
}

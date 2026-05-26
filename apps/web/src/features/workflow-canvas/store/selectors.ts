import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { useCanvasStore } from './canvas-store'
import { useCanvasUiStore } from './canvas-ui-store'

export const useSelectedNode = (): WorkflowCanvasNode | undefined => {
  const selectedId = useCanvasUiStore((state) => state.selectedNodeIds[0])
  return useCanvasStore((state) => {
    const index = selectedId ? state.nodeIndexById[selectedId] : undefined
    return index === undefined ? undefined : state.nodes[index]
  })
}

export const useCanvasNode = (nodeId: string): WorkflowCanvasNode | undefined =>
  useCanvasStore((state) => {
    const index = state.nodeIndexById[nodeId]
    return index === undefined ? undefined : state.nodes[index]
  })

export const useCanvasNodes = () => useCanvasStore((state) => state.nodes)

export const useCanvasEdges = () => useCanvasStore((state) => state.edges)

export const useCanvasNodeCount = () => useCanvasStore((state) => state.nodes.length)

export const useCanvasEdgeCount = () => useCanvasStore((state) => state.edges.length)

export const useCanvasMediaNodeCount = () =>
  useCanvasStore((state) =>
    state.nodes.filter((node) => node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation').length,
  )

export const useActiveNodePanel = (nodeId: string) =>
  useCanvasUiStore((state) => (state.activeNodePanel?.nodeId === nodeId ? state.activeNodePanel.panel : null))

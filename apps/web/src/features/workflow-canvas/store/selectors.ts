import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { useCanvasStore } from './canvas-store'

export const useSelectedNode = (): WorkflowCanvasNode | undefined =>
  useCanvasStore((state) => {
    const selectedId = state.selectedNodeIds[0]
    return selectedId ? state.nodes.find((node) => node.id === selectedId) : undefined
  })

export const useCanvasNode = (nodeId: string): WorkflowCanvasNode | undefined =>
  useCanvasStore((state) => state.nodes.find((node) => node.id === nodeId))

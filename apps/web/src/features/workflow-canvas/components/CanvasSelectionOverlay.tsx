import { useViewport } from '@xyflow/react'
import type { Viewport } from '@xyflow/react'

import { useFlowRenderStore } from '../render/flow-render-store'
import type { ScreenSelectionRect } from '../utils/canvas-selection-policy'
import type { CanvasNodeBounds } from '../domain/canvas-node-geometry'

const SELECTION_BOUNDS_PADDING = 18

interface CanvasSelectionOverlayProps {
  selectionRect?: ScreenSelectionRect | undefined
}

export function CanvasSelectionOverlay({ selectionRect }: CanvasSelectionOverlayProps) {
  return (
    <>
      <PersistentSelectionBounds />
      {selectionRect ? <CanvasSelectionRect rect={selectionRect} /> : null}
    </>
  )
}

function CanvasSelectionRect({ rect }: { rect: ScreenSelectionRect }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[17]">
      <div
        className="mina-wc-selection-rect absolute rounded-xl border border-brand-accent/45 bg-brand-accent/8"
        style={{
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width,
        }}
      />
    </div>
  )
}

function PersistentSelectionBounds() {
  const selectedNodeBounds = useFlowRenderStore((state) => state.selectedNodeBounds)
  const selectedNodeCount = useFlowRenderStore((state) => state.selectedNodeIdSet.size)
  const selectionDragActive = useFlowRenderStore((state) => state.interaction.selectionDragActive)
  const viewport = useViewport()
  const bounds = getPersistentSelectionBounds(selectedNodeBounds, viewport)

  if (!bounds || selectedNodeCount < 2 || selectionDragActive) {
    return null
  }

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[16]">
      <div
        className="mina-wc-persistent-selection-bounds absolute rounded-xl border border-brand-accent/45 bg-brand-accent/8"
        style={{
          height: bounds.height,
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
        }}
      />
    </div>
  )
}

function getPersistentSelectionBounds(
  bounds: CanvasNodeBounds | undefined,
  viewport: Viewport,
): { height: number; left: number; top: number; width: number } | undefined {
  if (!bounds) {
    return undefined
  }
  return {
    height: bounds.height * viewport.zoom + SELECTION_BOUNDS_PADDING * 2,
    left: bounds.left * viewport.zoom + viewport.x - SELECTION_BOUNDS_PADDING,
    top: bounds.top * viewport.zoom + viewport.y - SELECTION_BOUNDS_PADDING,
    width: bounds.width * viewport.zoom + SELECTION_BOUNDS_PADDING * 2,
  }
}

import { Position } from '@xyflow/react'

import type { CanvasAddMenuState } from '../store/canvas-ui-store'

export const CANVAS_ADD_MENU_WIDTH = 260
export const CANVAS_ADD_MENU_MAX_HEIGHT = 384
export const CANVAS_ADD_MENU_MARGIN = 12

const CANVAS_ADD_MENU_GHOST_ANCHOR_OFFSET_Y = 30

export interface CanvasAddMenuLayout {
  left: number
  maxHeight: number
  top: number
  width: number
}

export function getCanvasAddMenuLayout(state: Pick<CanvasAddMenuState, 'containerSize' | 'screenPosition'>): CanvasAddMenuLayout {
  return {
    left: Math.min(
      Math.max(CANVAS_ADD_MENU_MARGIN, state.screenPosition.x),
      Math.max(CANVAS_ADD_MENU_MARGIN, state.containerSize.width - CANVAS_ADD_MENU_WIDTH - CANVAS_ADD_MENU_MARGIN),
    ),
    maxHeight: CANVAS_ADD_MENU_MAX_HEIGHT,
    top: Math.min(
      Math.max(CANVAS_ADD_MENU_MARGIN, state.screenPosition.y),
      Math.max(CANVAS_ADD_MENU_MARGIN, state.containerSize.height - CANVAS_ADD_MENU_MAX_HEIGHT - CANVAS_ADD_MENU_MARGIN),
    ),
    width: CANVAS_ADD_MENU_WIDTH,
  }
}

export function getCanvasAddMenuGhostAnchor({
  layout,
  sourceX,
}: {
  layout: CanvasAddMenuLayout
  sourceX: number
}): {
  targetPosition: Position
  x: number
  y: number
} {
  const targetPosition = sourceX <= layout.left + layout.width / 2 ? Position.Left : Position.Right
  return {
    targetPosition,
    x: targetPosition === Position.Left ? layout.left : layout.left + layout.width,
    y: layout.top + CANVAS_ADD_MENU_GHOST_ANCHOR_OFFSET_Y,
  }
}

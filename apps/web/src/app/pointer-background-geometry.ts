import type { CSSProperties } from 'react'

export const POINTER_BACKGROUND_GEOMETRY = {
  dotGap: 20,
  dotSize: 2,
  highlightRadius: 70,
  highlightSoftEdge: 145,
  highlightSettleMs: 520,
} as const

export const POINTER_BACKGROUND_CSS_VARS = {
  '--mina-canvas-highlight-radius': `${POINTER_BACKGROUND_GEOMETRY.highlightRadius}px`,
  '--mina-canvas-highlight-soft-edge': `${POINTER_BACKGROUND_GEOMETRY.highlightSoftEdge}px`,
} as CSSProperties

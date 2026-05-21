import type { CSSProperties } from 'react'

export const WORKFLOW_HANDLE_GEOMETRY = {
  // React Flow measures the handle element for edge endpoints. Keep this tiny
  // and put the generous pointer target on a child so edge anchors stay on the card.
  anchorSize: 1,
  connectedScale: 0.72,
  hitSize: 72,
  magnetMaxShift: 16,
  magnetStrengthDistance: 32,
  orbSize: 22,
  orbRestOffset: 18,
} as const

export const WORKFLOW_CONNECTION_GEOMETRY = {
  radius: 46,
} as const

export const WORKFLOW_EDGE_GEOMETRY = {
  buttonHideDelayMs: 70,
  compactForwardDeltaX: 130,
  compactBezierCurvature: 0.2,
  forwardBezierCurvature: 0.32,
  hitStrokeWidth: 28,
  interactionWidth: 26,
  verticalCurvature: 0.24,
  verticalDominanceRatio: 1.45,
} as const

export const WORKFLOW_CANVAS_GEOMETRY_CSS_VARS = {
  '--mina-edge-hit-stroke-width': `${WORKFLOW_EDGE_GEOMETRY.hitStrokeWidth}px`,
  '--mina-handle-anchor-size': `${WORKFLOW_HANDLE_GEOMETRY.anchorSize}px`,
  '--mina-handle-connected-scale': String(WORKFLOW_HANDLE_GEOMETRY.connectedScale),
  '--mina-handle-hit-size': `${WORKFLOW_HANDLE_GEOMETRY.hitSize}px`,
  '--mina-handle-orb-size': `${WORKFLOW_HANDLE_GEOMETRY.orbSize}px`,
  '--mina-handle-rest-offset': `${WORKFLOW_HANDLE_GEOMETRY.orbRestOffset}px`,
} as CSSProperties

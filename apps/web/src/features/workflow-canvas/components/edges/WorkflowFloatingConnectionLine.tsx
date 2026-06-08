import type { Position } from '@xyflow/react'

import { getWorkflowConnectionPreviewStyle } from './workflow-connection-preview-style'
import { getWorkflowEdgeRoute } from './workflow-edge-routing'

interface WorkflowFloatingConnectionLineProps {
  sourcePosition: Position
  sourceX: number
  sourceY: number
  targetPosition: Position
  targetX: number
  targetY: number
}

export function WorkflowFloatingConnectionLine({
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY,
}: WorkflowFloatingConnectionLineProps) {
  const { path } = getWorkflowEdgeRoute({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  })

  return (
    <svg
      aria-hidden="true"
      className="mina-wc-floating-connection-line pointer-events-none absolute inset-0 z-[35] overflow-visible"
    >
      <g className="mina-wc-connection-line">
        <path className="mina-wc-connection-line-shadow" d={path} fill="none" />
        <path
          className="mina-wc-connection-line-core"
          d={path}
          fill="none"
          style={getWorkflowConnectionPreviewStyle({
            connectionStatus: null,
            mediaPreview: true,
          })}
        />
      </g>
    </svg>
  )
}

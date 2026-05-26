import {
  getBezierPath,
  type Position,
} from '@xyflow/react'

import { WORKFLOW_EDGE_GEOMETRY } from '../../workflow-canvas-geometry'

export interface WorkflowEdgeRouteInput {
  sourceX: number
  sourceY: number
  sourcePosition: Position
  targetX: number
  targetY: number
  targetPosition: Position
}

export interface WorkflowEdgeRouteResult {
  labelX: number
  labelY: number
  path: string
}

export function getWorkflowEdgeRoute({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: WorkflowEdgeRouteInput): WorkflowEdgeRouteResult {
  const deltaX = targetX - sourceX
  const deltaY = Math.abs(targetY - sourceY)
  const verticalDominant = deltaY > Math.abs(deltaX) * WORKFLOW_EDGE_GEOMETRY.verticalDominanceRatio

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: verticalDominant
      ? WORKFLOW_EDGE_GEOMETRY.verticalCurvature
      : deltaX < WORKFLOW_EDGE_GEOMETRY.compactForwardDeltaX
        ? WORKFLOW_EDGE_GEOMETRY.compactBezierCurvature
        : WORKFLOW_EDGE_GEOMETRY.forwardBezierCurvature,
  })

  return { labelX, labelY, path }
}

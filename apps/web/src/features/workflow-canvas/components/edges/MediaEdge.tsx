import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'

import type { WorkflowFlowEdge } from '../../domain/flow-types'

export const MediaEdge = memo(function MediaEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<WorkflowFlowEdge>) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return <BaseEdge className="mina-wc-media-edge" path={edgePath} />
})

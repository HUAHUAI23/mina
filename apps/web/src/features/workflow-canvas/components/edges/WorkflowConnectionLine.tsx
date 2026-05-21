import type { ConnectionLineComponentProps } from '@xyflow/react'

import type { WorkflowFlowNode } from '../../domain/flow-types'

import { getWorkflowConnectionPreviewStyle } from './workflow-connection-preview-style'
import { getWorkflowEdgeRoute } from './workflow-edge-routing'

export function WorkflowConnectionLine({
  connectionLineStyle,
  connectionStatus,
  fromNode,
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps<WorkflowFlowNode>) {
  const { path } = getWorkflowEdgeRoute({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  })
  const mediaPreview = fromNode.data.nodeType === 'image_generation' || fromNode.data.nodeType === 'video_generation'

  return (
    <g className="mina-wc-connection-line">
      <path className="mina-wc-connection-line-shadow" d={path} fill="none" />
      <path
        className="mina-wc-connection-line-core"
        d={path}
        fill="none"
        style={{
          ...getWorkflowConnectionPreviewStyle({ connectionStatus, mediaPreview }),
          ...connectionLineStyle,
        }}
      />
    </g>
  )
}

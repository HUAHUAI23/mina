import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import type { NodeGroupFlowNode } from '../../domain/flow-types'

export const NodeGroupNode = memo(function NodeGroupNode({ data, id }: NodeProps<NodeGroupFlowNode>) {
  markCanvasNodeRender(id)
  return (
    <section className="mina-wc-group-node mina-wc-node-group">
      <strong>{data.title}</strong>
      <span>Group</span>
    </section>
  )
})

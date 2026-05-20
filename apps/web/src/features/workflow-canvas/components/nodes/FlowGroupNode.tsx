import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import type { FlowGroupFlowNode } from '../../domain/flow-types'

export const FlowGroupNode = memo(function FlowGroupNode({ data, id }: NodeProps<FlowGroupFlowNode>) {
  markCanvasNodeRender(id)
  return (
    <section className="mina-wc-group-node mina-wc-flow-group">
      <strong>{data.title}</strong>
      <span>Flow scope</span>
    </section>
  )
})

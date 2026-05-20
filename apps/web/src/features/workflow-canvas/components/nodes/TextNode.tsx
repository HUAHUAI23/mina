import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import type { TextFlowNode } from '../../domain/flow-types'

export const TextNode = memo(function TextNode({ data, id }: NodeProps<TextFlowNode>) {
  markCanvasNodeRender(id)
  const text = data.textPreview ?? ''
  return (
    <article className="mina-wc-node mina-wc-text-node">
      <Handle className="mina-wc-handle" position={Position.Right} type="source" />
      <div className="mina-wc-node-header">
        <strong>{data.title}</strong>
        <span>Text</span>
      </div>
      <p>{text || 'Empty note'}</p>
    </article>
  )
})

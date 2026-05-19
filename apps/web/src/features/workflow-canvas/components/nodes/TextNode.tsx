import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

import type { TextFlowNode } from '../../domain/flow-types'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { useCanvasNode } from '../../store/selectors'

export const TextNode = memo(function TextNode({ id }: NodeProps<TextFlowNode>) {
  const node = useCanvasNode(id)
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  const text = node?.data.nodeType === 'text' ? node.data.config.text : ''
  return (
    <article className="mina-wc-node mina-wc-text-node" onClick={() => openNodePanel(id, 'config')}>
      <Handle className="mina-wc-handle" position={Position.Right} type="source" />
      <div className="mina-wc-node-header">
        <strong>{node?.data.title ?? 'Text'}</strong>
        <span>Text</span>
      </div>
      <p>{text || 'Empty note'}</p>
    </article>
  )
})

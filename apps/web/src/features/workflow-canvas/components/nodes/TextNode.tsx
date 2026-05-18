import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { WorkflowNodeData } from '@mina/contracts/modules/canvas'

export const TextNode = memo(function TextNode({ data }: NodeProps) {
  const nodeData = data as WorkflowNodeData
  const text = nodeData.nodeType === 'text' ? nodeData.config.text : ''
  return (
    <article className="mina-wc-node mina-wc-text-node">
      <Handle className="mina-wc-handle" position={Position.Right} type="source" />
      <div className="mina-wc-node-header">
        <strong>{nodeData.title}</strong>
        <span>Text</span>
      </div>
      <p>{text || 'Empty note'}</p>
    </article>
  )
})

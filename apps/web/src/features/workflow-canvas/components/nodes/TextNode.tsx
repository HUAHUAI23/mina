import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import type { TextFlowNode, WorkflowFlowNodeData } from '../../domain/flow-types'
import { WorkflowNodeHandles } from './WorkflowNodeHandles'

type TextNodeProps = NodeProps<TextFlowNode>

interface TextNodeViewProps {
  data: WorkflowFlowNodeData & { nodeType: 'text' }
  id: string
}

const textNodeViewPropsEqual = (previous: TextNodeViewProps, next: TextNodeViewProps): boolean =>
  previous.id === next.id &&
  previous.data.nodeId === next.data.nodeId &&
  previous.data.nodeType === next.data.nodeType &&
  previous.data.textPreview === next.data.textPreview &&
  previous.data.title === next.data.title

const textNodeRenderSignature = (data: TextNodeViewProps['data']): string =>
  JSON.stringify({
    nodeId: data.nodeId,
    nodeType: data.nodeType,
    textPreview: data.textPreview,
    title: data.title,
  })

const TextNodeView = memo(function TextNodeView({ data, id }: TextNodeViewProps) {
  markCanvasNodeRender(id, textNodeRenderSignature(data))
  const text = data.textPreview ?? ''
  return (
    <article className="mina-wc-node mina-wc-text-node">
      <WorkflowNodeHandles />
      <div className="mina-wc-node-header">
        <strong>{data.title}</strong>
        <span>Text</span>
      </div>
      <p>{text || 'Empty note'}</p>
    </article>
  )
}, textNodeViewPropsEqual)

export function TextNode({ data, id }: TextNodeProps) {
  return <TextNodeView data={data} id={id} />
}

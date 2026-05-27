import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { useMessages } from '../../../../app/i18n-provider'
import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import type { TextFlowNode, WorkflowFlowNodeData } from '../../domain/flow-types'
import { WorkflowNodeHandles } from './WorkflowNodeHandles'

type TextNodeProps = NodeProps<TextFlowNode>

interface TextNodeViewProps {
  data: WorkflowFlowNodeData & { nodeType: 'text' }
  id: string
}

const textNodeClassName = 'mina-wc-node relative grid min-h-[124px] w-[280px] origin-center gap-[9px] overflow-visible rounded-[14px] bg-[color-mix(in_oklch,var(--surface-container-lowest)_92%,transparent)] p-3 shadow-[0_26px_48px_-34px_color-mix(in_oklch,var(--foreground)_28%,transparent),inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_13%,transparent)]'
const nodeHeaderClassName = 'mina-wc-node-header flex items-center justify-between px-0.5'
const nodeTitleClassName = 'text-[0.84rem] text-foreground'
const nodeKindClassName = 'text-[0.66rem] font-extrabold text-foreground-tertiary'

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
  const m = useMessages()
  markCanvasNodeRender(id, textNodeRenderSignature(data))
  const text = data.textPreview ?? ''
  return (
    <article className={textNodeClassName}>
      <WorkflowNodeHandles />
      <div className={nodeHeaderClassName}>
        <strong className={nodeTitleClassName}>{data.title}</strong>
        <span className={nodeKindClassName}>{m.workflow_canvas_text()}</span>
      </div>
      <p className="m-0 text-[0.8rem] text-foreground-tertiary">{text || m.workflow_canvas_empty_note()}</p>
    </article>
  )
}, textNodeViewPropsEqual)

export function TextNode({ data, id }: TextNodeProps) {
  return <TextNodeView data={data} id={id} />
}

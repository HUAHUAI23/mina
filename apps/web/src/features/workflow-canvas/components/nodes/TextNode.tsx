import { memo, useEffect, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'

import { useMessages } from '../../../../app/i18n-provider'
import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import type { TextFlowNode, WorkflowFlowNodeData } from '../../domain/flow-types'
import { selectWorkflowCanvasNodes } from '../../store/canvas-selection-actions'
import { useCanvasStore } from '../../store/canvas-store'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { DetachFromGroupToolbar } from './DetachFromGroupToolbar'

type TextNodeProps = NodeProps<TextFlowNode>

interface TextNodeViewProps {
  data: WorkflowFlowNodeData & { nodeType: 'text' }
  id: string
  parentId?: string | undefined
  selected?: boolean | undefined
}

const nodeHeaderClassName = 'mina-wc-node-header flex items-center justify-between px-1'
const nodeTitleClassName = 'truncate text-[0.7rem] font-bold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase'
const nodeKindClassName = 'mina-wc-node-chrome mina-wc-node-kind rounded-full bg-zinc-150/80 dark:bg-zinc-800/80 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50 uppercase tracking-wider'
const textareaClassName = 'nodrag nopan nowheel m-0 h-full min-h-20 w-full resize-none overflow-auto rounded-lg border border-zinc-200/50 dark:border-zinc-800/40 bg-zinc-50/50 dark:bg-zinc-950/30 p-2.5 text-sm leading-5 text-foreground-secondary outline-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 hover:bg-zinc-100/40 dark:hover:bg-zinc-900/30 focus:bg-zinc-50/80 dark:focus:bg-zinc-950/60 focus:text-foreground focus:border-zinc-300/85 dark:focus:border-zinc-700/85 transition-all duration-200'

const textNodeViewPropsEqual = (previous: TextNodeViewProps, next: TextNodeViewProps): boolean =>
  previous.id === next.id &&
  previous.parentId === next.parentId &&
  previous.selected === next.selected &&
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

const TextNodeView = memo(function TextNodeView({ data, id, parentId, selected }: TextNodeViewProps) {
  const m = useMessages()
  const setNodeText = useCanvasStore((state) => state.setNodeText)
  const closeAddMenu = useCanvasUiStore((state) => state.closeAddMenu)
  const closeNodePanel = useCanvasUiStore((state) => state.closeNodePanel)
  markCanvasNodeRender(id, textNodeRenderSignature(data))
  const text = data.textPreview ?? ''
  const [draft, setDraft] = useState(text)

  useEffect(() => {
    setDraft(text)
  }, [id, text])

  const dynamicTextNodeClassName = [
    'mina-wc-node relative grid h-full min-h-32 min-w-56 origin-center grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-visible rounded-[18px] bg-card text-foreground border border-zinc-200 dark:border-zinc-800 p-3 shadow-sm transition-all duration-300',
    selected ? 'border-primary' : 'hover:border-zinc-300 dark:hover:border-zinc-700'
  ].join(' ')

  const resizerHandleClassName = 'mina-wc-node-resizer-handle mina-wc-text-node-resizer-handle'

  return (
    <>
      {parentId ? <DetachFromGroupToolbar nodeId={id} visible={selected} /> : null}
      <NodeResizer
        handleClassName={resizerHandleClassName}
        isVisible={Boolean(selected)}
        lineClassName="mina-wc-node-resizer-line"
        minHeight={128}
        minWidth={224}
      />
      <article className={dynamicTextNodeClassName} data-selected={selected ? 'true' : undefined}>
        <div className={nodeHeaderClassName}>
          <strong className={nodeTitleClassName}>{data.title}</strong>
          <span className={nodeKindClassName}>{m.workflow_canvas_text()}</span>
        </div>
        <textarea
          aria-label={m.workflow_canvas_text_node()}
          className={textareaClassName}
          data-mina-canvas-ignore="true"
          onChange={(event) => {
            const nextValue = event.target.value
            setDraft(nextValue)
            setNodeText(id, nextValue)
          }}
          onFocus={() => {
            closeAddMenu()
            closeNodePanel()
            selectWorkflowCanvasNodes([id])
          }}
          placeholder={m.workflow_canvas_empty_note()}
          rows={5}
          value={draft}
        />
      </article>
    </>
  )
}, textNodeViewPropsEqual)

export function TextNode({ data, id, parentId, selected }: TextNodeProps) {
  return <TextNodeView data={data} id={id} parentId={parentId} selected={selected} />
}

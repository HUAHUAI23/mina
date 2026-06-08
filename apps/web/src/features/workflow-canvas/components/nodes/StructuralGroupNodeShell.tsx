import { memo } from 'react'
import { NodeResizer, NodeToolbar, Position } from '@xyflow/react'
import { Maximize2, Move, Play, RefreshCw, Ungroup } from 'lucide-react'
import type { ResizeParamsWithDirection } from '@xyflow/react'

import { useMessages } from '../../../../app/i18n-provider'
import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import { useCanvasStore } from '../../store/canvas-store'
import { selectWorkflowCanvasNodes } from '../../store/canvas-selection-actions'
import { useWorkflowRuntimeStore } from '../../store/workflow-runtime-store'
import { getFlowRenderSnapshot } from '../../render/flow-render-store'
import type { WorkflowFlowNodeData } from '../../domain/flow-types'
import { canResizeWorkflowGroup } from '../../domain/group-resize-policy'
import { StructuralNodeToolbarButton } from './StructuralNodeToolbarButton'

interface StructuralGroupNodeShellProps {
  data: WorkflowFlowNodeData & { nodeType: 'flow_group' | 'node_group' }
  id: string
  selected?: boolean | undefined
}

const MIN_GROUP_HEIGHT = 180
const MIN_GROUP_WIDTH = 280

const renderSignature = (data: StructuralGroupNodeShellProps['data']): string =>
  JSON.stringify({
    nodeId: data.nodeId,
    nodeType: data.nodeType,
    title: data.title,
  })

const StructuralGroupNodeShellView = memo(function StructuralGroupNodeShellView({
  data,
  id,
  selected,
}: StructuralGroupNodeShellProps) {
  const m = useMessages()
  const convertGroupNodeType = useCanvasStore((state) => state.convertGroupNodeType)
  const fitGroupNodeToChildren = useCanvasStore((state) => state.fitGroupNodeToChildren)
  const ungroupGraphNode = useCanvasStore((state) => state.ungroupGraphNode)
  const runtimeActions = useWorkflowRuntimeStore((state) => state.actions)
  const runningNodeId = useWorkflowRuntimeStore((state) => state.runningNodeId)
  markCanvasNodeRender(id, renderSignature(data))

  const isFlowGroup = data.nodeType === 'flow_group'
  const isRunning = runningNodeId === id
  const convertLabel = isFlowGroup ? m.workflow_canvas_convert_to_node_group() : m.workflow_canvas_convert_to_flow_group()

  const dynamicShellClassName = [
    'mina-wc-node mina-wc-group-node pointer-events-auto relative h-full min-h-40 min-w-64 overflow-visible rounded-[20px] bg-zinc-100/95 dark:bg-zinc-900/95 text-foreground border border-[var(--mina-wc-primary)]/25 dark:border-[var(--mina-wc-primary)]/20 transition-all duration-300 ease-in-out shadow-sm',
    selected ? 'border-primary dark:border-primary' : 'hover:border-primary/45'
  ].join(' ')

  const headerClassName = 'workflow-group-drag-handle pointer-events-auto absolute left-4 top-0 z-10 flex h-10 max-w-[calc(100%-2rem)] -translate-y-1/2 cursor-grab items-center gap-2.5 rounded-full bg-zinc-50/95 dark:bg-zinc-900/95 px-3 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all duration-200 active:cursor-grabbing'

  const titleClassName = 'truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight'

  const toolbarClassName = 'nodrag nopan nowheel flex h-10 items-center gap-1 rounded-full bg-zinc-50/95 dark:bg-zinc-900/95 px-1.5 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm'
  const contentGuideClassName = `pointer-events-none absolute inset-4 rounded-[14px] border border-dashed border-zinc-300/50 dark:border-zinc-700/50 transition-opacity duration-200 ${selected ? 'opacity-70' : 'opacity-40'}`
  const topRuleClassName = isFlowGroup
    ? `pointer-events-none absolute left-6 right-6 top-0 h-[2px] rounded-full ${isRunning ? 'mina-wc-shimmer-bg bg-gradient-to-r from-blue-500 via-indigo-500 via-purple-500 via-pink-500 via-blue-500 to-indigo-500' : 'bg-gradient-to-r from-blue-500 via-indigo-500 via-purple-500 to-pink-500 opacity-70'}`
    : `pointer-events-none absolute left-6 right-6 top-0 h-[2px] rounded-full ${selected ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-zinc-200 dark:bg-zinc-800'}`

  const resizerHandleClassName = 'mina-wc-node-resizer-handle mina-wc-group-node-resizer-handle'

  const shouldResize = (_event: unknown, params: ResizeParamsWithDirection): boolean => {
    const nodes = getFlowRenderSnapshot().flowNodes
    const groupNode = nodes.find((node) => node.id === id)
    const childNodes = nodes.filter((node) => node.parentId === id)
    return canResizeWorkflowGroup({
      childNodes,
      groupNode,
      minHeight: MIN_GROUP_HEIGHT,
      minWidth: MIN_GROUP_WIDTH,
      params,
    })
  }

  return (
    <>
      <NodeResizer
        handleClassName={resizerHandleClassName}
        isVisible={Boolean(selected)}
        lineClassName="mina-wc-node-resizer-line"
        minHeight={MIN_GROUP_HEIGHT}
        minWidth={MIN_GROUP_WIDTH}
        shouldResize={shouldResize}
      />
      <NodeToolbar
        className="nodrag nopan nowheel"
        isVisible={Boolean(selected)}
        offset={12}
        position={Position.Top}
      >
        <div className={toolbarClassName} data-mina-canvas-ignore="true">
          {isFlowGroup ? (
            <StructuralNodeToolbarButton
              disabled={runningNodeId === id}
              icon={Play}
              label={m.workflow_canvas_run()}
              onClick={() => runtimeActions.onRunNode(id)}
            />
          ) : null}
          <StructuralNodeToolbarButton
            icon={Maximize2}
            label={m.workflow_canvas_fit_to_contents()}
            onClick={() => fitGroupNodeToChildren(id)}
          />
          <StructuralNodeToolbarButton
            icon={RefreshCw}
            label={convertLabel}
            onClick={() => convertGroupNodeType(id, isFlowGroup ? 'node_group' : 'flow_group')}
            showLabel
          />
          <StructuralNodeToolbarButton
            icon={Ungroup}
            label={m.workflow_canvas_ungroup()}
            onClick={() => {
              ungroupGraphNode(id)
              selectWorkflowCanvasNodes([])
            }}
          />
        </div>
      </NodeToolbar>
      <section
        className={dynamicShellClassName}
        data-selected={selected ? 'true' : undefined}
        data-mina-canvas-scope={data.nodeType}
        data-mina-canvas-scope-id={id}
      >
        <div aria-hidden="true" className={topRuleClassName} />
        <div className={contentGuideClassName} />
        <div
          className={headerClassName}
          data-mina-canvas-ignore="true"
        >
          <Move aria-hidden="true" className="flex-none text-foreground-tertiary" size={14} />
          <strong className={titleClassName}>{data.title}</strong>
        </div>
      </section>
    </>
  )
})

export function StructuralGroupNodeShell(props: StructuralGroupNodeShellProps) {
  return <StructuralGroupNodeShellView {...props} />
}

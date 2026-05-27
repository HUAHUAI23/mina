import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { useMessages } from '../../../../app/i18n-provider'
import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import type { FlowGroupFlowNode, WorkflowFlowNodeData } from '../../domain/flow-types'
import { WorkflowNodeHandles } from './WorkflowNodeHandles'

type FlowGroupNodeProps = NodeProps<FlowGroupFlowNode>

interface FlowGroupNodeViewProps {
  data: WorkflowFlowNodeData & { nodeType: 'flow_group' }
  id: string
}

const groupNodeClassName = 'mina-wc-group-node mina-wc-flow-group flex h-full gap-2.5 rounded-2xl bg-[color-mix(in_oklch,var(--surface-container-lowest)_72%,transparent)] p-4 text-foreground-tertiary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_9%,transparent)]'

const flowGroupNodeViewPropsEqual = (previous: FlowGroupNodeViewProps, next: FlowGroupNodeViewProps): boolean =>
  previous.id === next.id &&
  previous.data.nodeId === next.data.nodeId &&
  previous.data.nodeType === next.data.nodeType &&
  previous.data.title === next.data.title

const groupNodeRenderSignature = (data: FlowGroupNodeViewProps['data']): string =>
  JSON.stringify({
    nodeId: data.nodeId,
    nodeType: data.nodeType,
    title: data.title,
  })

const FlowGroupNodeView = memo(function FlowGroupNodeView({ data, id }: FlowGroupNodeViewProps) {
  const m = useMessages()
  markCanvasNodeRender(id, groupNodeRenderSignature(data))
  return (
    <section className={groupNodeClassName}>
      <WorkflowNodeHandles />
      <strong>{data.title}</strong>
      <span>{m.workflow_canvas_executable_scope()}</span>
    </section>
  )
}, flowGroupNodeViewPropsEqual)

export function FlowGroupNode({ data, id }: FlowGroupNodeProps) {
  return <FlowGroupNodeView data={data} id={id} />
}

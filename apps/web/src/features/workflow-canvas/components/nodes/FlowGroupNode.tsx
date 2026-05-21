import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import type { FlowGroupFlowNode, WorkflowFlowNodeData } from '../../domain/flow-types'
import { WorkflowNodeHandles } from './WorkflowNodeHandles'

type FlowGroupNodeProps = NodeProps<FlowGroupFlowNode>

interface FlowGroupNodeViewProps {
  data: WorkflowFlowNodeData & { nodeType: 'flow_group' }
  id: string
}

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
  markCanvasNodeRender(id, groupNodeRenderSignature(data))
  return (
    <section className="mina-wc-group-node mina-wc-flow-group">
      <WorkflowNodeHandles />
      <strong>{data.title}</strong>
      <span>Flow scope</span>
    </section>
  )
}, flowGroupNodeViewPropsEqual)

export function FlowGroupNode({ data, id }: FlowGroupNodeProps) {
  return <FlowGroupNodeView data={data} id={id} />
}

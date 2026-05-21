import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { markCanvasNodeRender } from '../../diagnostics/canvas-render-counts'
import type { NodeGroupFlowNode, WorkflowFlowNodeData } from '../../domain/flow-types'
import { WorkflowNodeHandles } from './WorkflowNodeHandles'

type NodeGroupNodeProps = NodeProps<NodeGroupFlowNode>

interface NodeGroupNodeViewProps {
  data: WorkflowFlowNodeData & { nodeType: 'node_group' }
  id: string
}

const nodeGroupNodeViewPropsEqual = (previous: NodeGroupNodeViewProps, next: NodeGroupNodeViewProps): boolean =>
  previous.id === next.id &&
  previous.data.nodeId === next.data.nodeId &&
  previous.data.nodeType === next.data.nodeType &&
  previous.data.title === next.data.title

const groupNodeRenderSignature = (data: NodeGroupNodeViewProps['data']): string =>
  JSON.stringify({
    nodeId: data.nodeId,
    nodeType: data.nodeType,
    title: data.title,
  })

const NodeGroupNodeView = memo(function NodeGroupNodeView({ data, id }: NodeGroupNodeViewProps) {
  markCanvasNodeRender(id, groupNodeRenderSignature(data))
  return (
    <section className="mina-wc-group-node mina-wc-node-group">
      <WorkflowNodeHandles />
      <strong>{data.title}</strong>
      <span>Group</span>
    </section>
  )
}, nodeGroupNodeViewPropsEqual)

export function NodeGroupNode({ data, id }: NodeGroupNodeProps) {
  return <NodeGroupNodeView data={data} id={id} />
}

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import type { NodeGroupFlowNode, WorkflowFlowNodeData } from '../../domain/flow-types'
import { StructuralGroupNodeShell } from './StructuralGroupNodeShell'

type NodeGroupNodeProps = NodeProps<NodeGroupFlowNode>

interface NodeGroupNodeViewProps {
  data: WorkflowFlowNodeData & { nodeType: 'node_group' }
  id: string
  selected?: boolean | undefined
}

const nodeGroupNodeViewPropsEqual = (previous: NodeGroupNodeViewProps, next: NodeGroupNodeViewProps): boolean =>
  previous.id === next.id &&
  previous.selected === next.selected &&
  previous.data.nodeId === next.data.nodeId &&
  previous.data.nodeType === next.data.nodeType &&
  previous.data.title === next.data.title

const NodeGroupNodeView = memo(function NodeGroupNodeView({ data, id, selected }: NodeGroupNodeViewProps) {
  return <StructuralGroupNodeShell data={data} id={id} selected={selected} />
}, nodeGroupNodeViewPropsEqual)

export function NodeGroupNode({ data, id, selected }: NodeGroupNodeProps) {
  return <NodeGroupNodeView data={data} id={id} selected={selected} />
}

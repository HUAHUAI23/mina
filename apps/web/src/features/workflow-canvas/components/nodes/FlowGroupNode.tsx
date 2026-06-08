import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import type { FlowGroupFlowNode, WorkflowFlowNodeData } from '../../domain/flow-types'
import { StructuralGroupNodeShell } from './StructuralGroupNodeShell'

type FlowGroupNodeProps = NodeProps<FlowGroupFlowNode>

interface FlowGroupNodeViewProps {
  data: WorkflowFlowNodeData & { nodeType: 'flow_group' }
  id: string
  selected?: boolean | undefined
}

const flowGroupNodeViewPropsEqual = (previous: FlowGroupNodeViewProps, next: FlowGroupNodeViewProps): boolean =>
  previous.id === next.id &&
  previous.selected === next.selected &&
  previous.data.nodeId === next.data.nodeId &&
  previous.data.nodeType === next.data.nodeType &&
  previous.data.title === next.data.title

const FlowGroupNodeView = memo(function FlowGroupNodeView({ data, id, selected }: FlowGroupNodeViewProps) {
  return <StructuralGroupNodeShell data={data} id={id} selected={selected} />
}, flowGroupNodeViewPropsEqual)

export function FlowGroupNode({ data, id, selected }: FlowGroupNodeProps) {
  return <FlowGroupNodeView data={data} id={id} selected={selected} />
}

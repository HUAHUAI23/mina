import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { WorkflowNodeData } from '@mina/contracts/modules/canvas'

export const NodeGroupNode = memo(function NodeGroupNode({ data }: NodeProps) {
  const nodeData = data as WorkflowNodeData
  return (
    <section className="mina-wc-group-node mina-wc-node-group">
      <strong>{nodeData.title}</strong>
      <span>Group</span>
    </section>
  )
})

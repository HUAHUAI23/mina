import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { WorkflowNodeData } from '@mina/contracts/modules/canvas'

export const FlowGroupNode = memo(function FlowGroupNode({ data }: NodeProps) {
  const nodeData = data as WorkflowNodeData
  return (
    <section className="mina-wc-group-node mina-wc-flow-group">
      <strong>{nodeData.title}</strong>
      <span>Flow scope</span>
    </section>
  )
})

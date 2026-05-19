import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import type { NodeGroupFlowNode } from '../../domain/flow-types'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { useCanvasNode } from '../../store/selectors'

export const NodeGroupNode = memo(function NodeGroupNode({ id }: NodeProps<NodeGroupFlowNode>) {
  const node = useCanvasNode(id)
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  return (
    <section className="mina-wc-group-node mina-wc-node-group" onClick={() => openNodePanel(id, 'config')}>
      <strong>{node?.data.title ?? 'Node Group'}</strong>
      <span>Group</span>
    </section>
  )
})

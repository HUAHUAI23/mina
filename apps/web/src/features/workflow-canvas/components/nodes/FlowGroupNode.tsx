import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import type { FlowGroupFlowNode } from '../../domain/flow-types'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { useCanvasNode } from '../../store/selectors'

export const FlowGroupNode = memo(function FlowGroupNode({ id }: NodeProps<FlowGroupFlowNode>) {
  const node = useCanvasNode(id)
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  return (
    <section className="mina-wc-group-node mina-wc-flow-group" onClick={() => openNodePanel(id, 'config')}>
      <strong>{node?.data.title ?? 'Flow Group'}</strong>
      <span>Flow scope</span>
    </section>
  )
})

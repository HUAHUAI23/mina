import { memo } from 'react'
import { NodeToolbar, Position } from '@xyflow/react'
import { LogOut } from 'lucide-react'

import { useMessages } from '../../../../app/i18n-provider'
import { useCanvasStore } from '../../store/canvas-store'
import { StructuralNodeToolbarButton } from './StructuralNodeToolbarButton'

interface DetachFromGroupToolbarProps {
  nodeId: string
  visible?: boolean | undefined
}

export const DetachFromGroupToolbar = memo(function DetachFromGroupToolbar({
  nodeId,
  visible,
}: DetachFromGroupToolbarProps) {
  const m = useMessages()
  const detachGraphNodes = useCanvasStore((state) => state.detachGraphNodes)

  return (
    <NodeToolbar
      className="nodrag nopan nowheel"
      isVisible={Boolean(visible)}
      offset={12}
      position={Position.Top}
    >
      <div className="nodrag nopan nowheel flex items-center rounded-full border border-border/80 bg-card p-1 shadow-sm" data-mina-canvas-ignore="true">
        <StructuralNodeToolbarButton
          icon={LogOut}
          label={m.workflow_canvas_detach_from_group()}
          onClick={() => detachGraphNodes([nodeId])}
        />
      </div>
    </NodeToolbar>
  )
})

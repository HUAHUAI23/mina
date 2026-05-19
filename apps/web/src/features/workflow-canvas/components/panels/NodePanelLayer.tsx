import { NodeToolbar, Position } from '@xyflow/react'

import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { useCanvasNode } from '../../store/selectors'
import { NodeConfigCard } from './NodeConfigCard'

interface NodePanelLayerProps {
  onRunNode(nodeId: string): void
  runError?: string | undefined
  runningNodeId?: string | undefined
}

export function NodePanelLayer({ onRunNode, runError, runningNodeId }: NodePanelLayerProps) {
  const activePanel = useCanvasUiStore((state) => state.activeNodePanel)
  const activeNodeId = activePanel?.nodeId
  const node = useCanvasNode(activePanel?.nodeId ?? '')

  if (!activePanel || activePanel.panel !== 'config') {
    return null
  }
  if (!activeNodeId || !node) {
    return null
  }

  return (
    <NodeToolbar
      align="center"
      className="mina-wc-node-config-toolbar nodrag nowheel nopan"
      data-mina-canvas-ignore="true"
      data-mina-canvas-panel-root="true"
      isVisible
      nodeId={activeNodeId}
      offset={24}
      position={Position.Bottom}
    >
      <NodeConfigCard
        node={node}
        onRun={() => onRunNode(node.id)}
        runError={runError}
        running={runningNodeId === node.id}
      />
    </NodeToolbar>
  )
}

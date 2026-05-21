import { Handle, Position, useNodeConnections, useNodeId } from '@xyflow/react'
import { useCallback, type CSSProperties } from 'react'

import { WORKFLOW_HANDLE_GEOMETRY } from '../../workflow-canvas-geometry'

interface WorkflowNodeHandlesProps {
  target?: boolean
  source?: boolean
}

const baseHandleStyle = {
  background: 'transparent',
  border: 0,
  borderRadius: 999,
  height: WORKFLOW_HANDLE_GEOMETRY.anchorSize,
  minHeight: WORKFLOW_HANDLE_GEOMETRY.anchorSize,
  minWidth: WORKFLOW_HANDLE_GEOMETRY.anchorSize,
  pointerEvents: 'all',
  touchAction: 'none',
  width: WORKFLOW_HANDLE_GEOMETRY.anchorSize,
} satisfies CSSProperties

function useMagneticHandle() {
  const resetHandle = useCallback((event: React.PointerEvent<HTMLSpanElement>) => {
    event.currentTarget.style.removeProperty('--mina-handle-x')
    event.currentTarget.style.removeProperty('--mina-handle-y')
  }, [])

  const moveHandle = useCallback((event: React.PointerEvent<HTMLSpanElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const restX = event.currentTarget.dataset.side === 'source'
      ? WORKFLOW_HANDLE_GEOMETRY.orbRestOffset
      : -WORKFLOW_HANDLE_GEOMETRY.orbRestOffset
    const x = event.clientX - (rect.left + rect.width / 2 + restX)
    const y = event.clientY - (rect.top + rect.height / 2)
    const distance = Math.hypot(x, y) || 1
    const strength = Math.min(1, distance / WORKFLOW_HANDLE_GEOMETRY.magnetStrengthDistance)
    const shift = WORKFLOW_HANDLE_GEOMETRY.magnetMaxShift
    event.currentTarget.style.setProperty('--mina-handle-x', `${(x / distance) * strength * shift}px`)
    event.currentTarget.style.setProperty('--mina-handle-y', `${(y / distance) * strength * shift}px`)
  }, [])

  return { moveHandle, resetHandle }
}

export function WorkflowNodeHandles({
  target = true,
  source = true,
}: WorkflowNodeHandlesProps) {
  const { moveHandle, resetHandle } = useMagneticHandle()
  const nodeId = useNodeId()
  const connections = useNodeConnections()
  const targetConnected = target && connections.some((connection) =>
    connection.target === nodeId && (connection.targetHandle === 'target' || connection.targetHandle === null),
  )
  const sourceConnected = source && connections.some((connection) =>
    connection.source === nodeId && (connection.sourceHandle === 'source' || connection.sourceHandle === null),
  )

  return (
    <>
      {target ? (
        <Handle
          id="target"
          className="mina-wc-handle mina-wc-handle-target"
          data-connected={targetConnected ? 'true' : undefined}
          position={Position.Left}
          style={baseHandleStyle}
          type="target"
        >
          <span
            className="mina-wc-handle-hit"
            data-side="target"
            onPointerLeave={resetHandle}
            onPointerMove={moveHandle}
          >
            <span aria-hidden="true" className="mina-wc-handle-orb" />
          </span>
        </Handle>
      ) : null}
      {source ? (
        <Handle
          id="source"
          className="mina-wc-handle mina-wc-handle-source"
          data-connected={sourceConnected ? 'true' : undefined}
          position={Position.Right}
          style={baseHandleStyle}
          type="source"
        >
          <span
            className="mina-wc-handle-hit"
            data-side="source"
            onPointerLeave={resetHandle}
            onPointerMove={moveHandle}
          >
            <span aria-hidden="true" className="mina-wc-handle-orb" />
          </span>
        </Handle>
      ) : null}
    </>
  )
}

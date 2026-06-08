import { BaseEdge, ViewportPortal, type EdgeProps } from '@xyflow/react'
import { Scissors } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useMessages } from '../../../../app/i18n-provider'
import type { WorkflowFlowEdge } from '../../domain/flow-types'
import { useCanvasStore } from '../../store/canvas-store'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { WORKFLOW_EDGE_GEOMETRY } from '../../workflow-canvas-geometry'

import { getWorkflowEdgeRoute } from './workflow-edge-routing'

const edgeActionClassName = 'mina-wc-edge-action nodrag nopan nowheel pointer-events-auto absolute z-20 flex items-center rounded-full bg-[color-mix(in_oklch,var(--surface-container-lowest)_94%,transparent)] p-1 shadow-md ring-1 ring-border'
const edgeActionButtonClassName = 'flex size-[30px] items-center justify-center rounded-full border border-transparent bg-transparent text-foreground-tertiary pointer-events-auto hover:bg-surface-container-low hover:text-foreground'
const edgeDeleteActionButtonClassName = 'hover:border-[color:color-mix(in_oklch,var(--destructive)_24%,var(--outline-ghost))] hover:bg-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))] hover:text-destructive-foreground'

export const MediaEdge = memo(function MediaEdge({
  id,
  source,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  target,
  selected,
  data,
  markerEnd,
}: EdgeProps<WorkflowFlowEdge>) {
  const m = useMessages()
  const removeGraphEdges = useCanvasStore((state) => state.removeGraphEdges)
  const sourceNodeSelected = useCanvasUiStore((state) =>
    state.selectedNodeIds.includes(source),
  )
  const targetNodeSelected = useCanvasUiStore((state) =>
    state.selectedNodeIds.includes(target),
  )
  const edgeHoveredByFlow = useCanvasUiStore((state) => state.hoveredEdgeId === id)
  const [isHovered, setIsHovered] = useState(false)
  const [isButtonHovered, setIsButtonHovered] = useState(false)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const route = useMemo(
    () =>
      getWorkflowEdgeRoute({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      }),
    [sourcePosition, sourceX, sourceY, targetPosition, targetX, targetY],
  )
  const isMediaLink = Boolean(data?.connection)
  const hovered = Boolean(isHovered || isButtonHovered)
  const active = Boolean(selected || sourceNodeSelected || targetNodeSelected || hovered || edgeHoveredByFlow)
  const flowing = Boolean(sourceNodeSelected || targetNodeSelected || selected)
  const cutConnectionLabel = m.workflow_canvas_cut_connection()

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }, [])

  useEffect(() => clearLeaveTimer, [clearLeaveTimer])

  const handleMouseEnter = useCallback(() => {
    clearLeaveTimer()
    setIsHovered(true)
  }, [clearLeaveTimer])

  const handleMouseLeave = useCallback(() => {
    clearLeaveTimer()
    leaveTimerRef.current = setTimeout(() => {
      leaveTimerRef.current = null
      setIsHovered(false)
    }, WORKFLOW_EDGE_GEOMETRY.buttonHideDelayMs)
  }, [clearLeaveTimer])

  const handleButtonMouseEnter = useCallback(() => {
    clearLeaveTimer()
    setIsButtonHovered(true)
    setIsHovered(true)
  }, [clearLeaveTimer])

  const handleButtonMouseLeave = useCallback(() => {
    clearLeaveTimer()
    setIsButtonHovered(false)
    setIsHovered(false)
  }, [clearLeaveTimer])

  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      removeGraphEdges([id])
    },
    [id, removeGraphEdges],
  )

  return (
    <>
      <g
        className="mina-wc-media-edge-shell"
        data-active={active ? 'true' : undefined}
        data-flowing={flowing ? 'true' : undefined}
        data-media={isMediaLink ? 'true' : undefined}
      >
        <BaseEdge
          id={id}
          interactionWidth={WORKFLOW_EDGE_GEOMETRY.interactionWidth}
          {...(markerEnd ? { markerEnd } : {})}
          path={route.path}
          className="mina-wc-media-edge"
        />
        <path
          className="mina-wc-media-edge-flow"
          d={route.path}
          fill="none"
          pathLength={100}
          aria-hidden="true"
        />
        <path
          className="mina-wc-media-edge-hit"
          d={route.path}
          fill="none"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      </g>

      {active ? (
        <ViewportPortal>
          <div
            className={edgeActionClassName}
            style={{
              transform: `translate(-50%, -50%) translate(${route.labelX}px, ${route.labelY}px)`,
            }}
          >
            <button
              aria-label={cutConnectionLabel}
              className={`${edgeActionButtonClassName} ${edgeDeleteActionButtonClassName}`}
              onClick={handleDelete}
              onMouseEnter={handleButtonMouseEnter}
              onMouseLeave={handleButtonMouseLeave}
              title={cutConnectionLabel}
              type="button"
            >
              <Scissors aria-hidden="true" size={13} />
            </button>
          </div>
        </ViewportPortal>
      ) : null}
    </>
  )
})

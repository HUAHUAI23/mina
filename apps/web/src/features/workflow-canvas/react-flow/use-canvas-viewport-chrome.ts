import { useCallback, type RefObject } from 'react'
import type { OnMove, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'

type CanvasZoomTier = 'detail' | 'normal' | 'overview'

const OVERVIEW_ZOOM_MAX = 0.6
const DETAIL_ZOOM_MIN = 1.35

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const zoomTierForViewport = (zoom: number): CanvasZoomTier => {
  if (zoom < OVERVIEW_ZOOM_MAX) {
    return 'overview'
  }
  if (zoom >= DETAIL_ZOOM_MIN) {
    return 'detail'
  }
  return 'normal'
}

const nodeChromeZoomScaleForViewport = (zoom: number): number => {
  if (zoom < OVERVIEW_ZOOM_MAX) {
    return clamp(1 + (OVERVIEW_ZOOM_MAX - zoom) * 0.36, 1, 1.14)
  }
  if (zoom >= DETAIL_ZOOM_MIN) {
    return clamp(1 - (zoom - DETAIL_ZOOM_MIN) * 0.06, 0.9, 1)
  }
  return 1
}

const syncCanvasViewportChrome = (
  stage: HTMLDivElement | null,
  viewport: Viewport,
  moving: boolean,
): void => {
  if (!stage) {
    return
  }
  const zoomTier = zoomTierForViewport(viewport.zoom)
  stage.dataset.zoomTier = zoomTier
  stage.dataset.viewportMoving = moving ? 'true' : 'false'
  stage.style.setProperty('--mina-wc-viewport-zoom', viewport.zoom.toFixed(3))
  stage.style.setProperty('--mina-wc-node-chrome-zoom-scale', nodeChromeZoomScaleForViewport(viewport.zoom).toFixed(3))
}

interface UseCanvasViewportChromeInput {
  onMove: OnMove
  onMoveEnd: OnMove
  onMoveStart(): void
  reactFlowInstanceRef: RefObject<ReactFlowInstance<WorkflowFlowNode, WorkflowFlowEdge> | null>
  stageRef: RefObject<HTMLDivElement | null>
}

export const useCanvasViewportChrome = ({
  onMove,
  onMoveEnd,
  onMoveStart,
  reactFlowInstanceRef,
  stageRef,
}: UseCanvasViewportChromeInput) => {
  const handleReactFlowInit = useCallback((instance: ReactFlowInstance<WorkflowFlowNode, WorkflowFlowEdge>) => {
    reactFlowInstanceRef.current = instance
    syncCanvasViewportChrome(stageRef.current, instance.getViewport(), false)
  }, [reactFlowInstanceRef, stageRef])

  const handleMove = useCallback<OnMove>((event, viewport) => {
    syncCanvasViewportChrome(stageRef.current, viewport, true)
    onMove(event, viewport)
  }, [onMove, stageRef])

  const handleMoveStart = useCallback<OnMove>((_event, viewport) => {
    syncCanvasViewportChrome(stageRef.current, viewport, true)
    onMoveStart()
  }, [onMoveStart, stageRef])

  const handleMoveEnd = useCallback<OnMove>((event, viewport) => {
    syncCanvasViewportChrome(stageRef.current, viewport, false)
    onMoveEnd(event, viewport)
  }, [onMoveEnd, stageRef])

  return {
    handleMove,
    handleMoveEnd,
    handleMoveStart,
    handleReactFlowInit,
  }
}

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { ReactFlowInstance, XYPosition } from '@xyflow/react'

import { selectWorkflowCanvasNodes } from '../store/canvas-selection-actions'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'
import {
  createFlowSelectionRect,
  createScreenSelectionRect,
  resolveNodeIdsInFlowSelectionRect,
  type ScreenSelectionRect,
} from '../utils/canvas-selection-policy'
import { resolveCanvasDomScope } from '../utils/canvas-dom-scope'

const SELECTION_DRAG_THRESHOLD = 4

interface UseCanvasSelectionControllerInput {
  nodes: readonly WorkflowFlowNode[]
  onSelectionBoxEnd(): void
  onSelectionBoxStart(): void
  reactFlowInstanceRef: RefObject<ReactFlowInstance<WorkflowFlowNode, WorkflowFlowEdge> | null>
  stageRef: RefObject<HTMLDivElement | null>
}

const hasSelectionChanged = (left: readonly string[], right: readonly string[]): boolean =>
  left.length !== right.length || left.some((id, index) => id !== right[index])

const mergeSelectedNodeIds = (
  baseNodeIds: readonly string[],
  nextNodeIds: readonly string[],
  additive: boolean,
): string[] => {
  if (!additive) {
    return [...nextNodeIds]
  }
  const merged = [...baseNodeIds]
  const seen = new Set(baseNodeIds)
  for (const nodeId of nextNodeIds) {
    if (!seen.has(nodeId)) {
      seen.add(nodeId)
      merged.push(nodeId)
    }
  }
  return merged
}

const suppressNextClick = (): void => {
  const stopClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('click', stopClick, true)
  window.setTimeout(() => window.removeEventListener('click', stopClick, true), 0)
}

export function useCanvasSelectionController({
  nodes,
  onSelectionBoxEnd,
  onSelectionBoxStart,
  reactFlowInstanceRef,
  stageRef,
}: UseCanvasSelectionControllerInput): {
  onPointerDownCapture(event: ReactPointerEvent<HTMLDivElement>): void
  selectionRect: ScreenSelectionRect | undefined
} {
  const [selectionRect, setSelectionRect] = useState<ScreenSelectionRect | undefined>(undefined)
  const cleanupRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => () => {
    cleanupRef.current?.()
    cleanupRef.current = undefined
  }, [])

  const onPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary) {
      return
    }
    const scope = resolveCanvasDomScope(event.target)
    const stage = stageRef.current
    const reactFlow = reactFlowInstanceRef.current
    if (!scope || !stage || !reactFlow) {
      return
    }

    cleanupRef.current?.()
    cleanupRef.current = undefined

    const stageBounds = stage.getBoundingClientRect()
    const startClientPosition: XYPosition = { x: event.clientX, y: event.clientY }
    const baseSelectedNodeIds = event.metaKey || event.ctrlKey || event.shiftKey
      ? useCanvasUiStore.getState().selectedNodeIds
      : []
    let active = false
    let latestClientPosition = startClientPosition
    let frameId: number | undefined

    const syncSelection = () => {
      frameId = undefined
      if (!active) {
        return
      }
      const startFlowPosition = reactFlow.screenToFlowPosition(startClientPosition)
      const currentFlowPosition = reactFlow.screenToFlowPosition(latestClientPosition)
      const nodeIds = mergeSelectedNodeIds(
        baseSelectedNodeIds,
        resolveNodeIdsInFlowSelectionRect(
          nodes,
          scope,
          createFlowSelectionRect(startFlowPosition, currentFlowPosition),
        ),
        baseSelectedNodeIds.length > 0,
      )
      if (hasSelectionChanged(nodeIds, useCanvasUiStore.getState().selectedNodeIds)) {
        selectWorkflowCanvasNodes(nodeIds)
      }
      setSelectionRect(createScreenSelectionRect(
        {
          x: startClientPosition.x - stageBounds.left,
          y: startClientPosition.y - stageBounds.top,
        },
        {
          x: latestClientPosition.x - stageBounds.left,
          y: latestClientPosition.y - stageBounds.top,
        },
      ))
    }

    const scheduleSelectionSync = () => {
      if (frameId !== undefined) {
        return
      }
      frameId = window.requestAnimationFrame(syncSelection)
    }

    const finishSelection = (suppressClick: boolean) => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId)
        frameId = undefined
      }
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerUp, true)
      window.removeEventListener('pointercancel', handlePointerCancel, true)
      cleanupRef.current = undefined
      if (!active) {
        return
      }
      syncSelection()
      setSelectionRect(undefined)
      onSelectionBoxEnd()
      if (suppressClick) {
        suppressNextClick()
      }
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) {
        return
      }
      latestClientPosition = { x: moveEvent.clientX, y: moveEvent.clientY }
      if (!active) {
        const distance = Math.hypot(
          latestClientPosition.x - startClientPosition.x,
          latestClientPosition.y - startClientPosition.y,
        )
        if (distance <= SELECTION_DRAG_THRESHOLD) {
          return
        }
        active = true
        onSelectionBoxStart()
      }
      moveEvent.preventDefault()
      scheduleSelectionSync()
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === event.pointerId) {
        finishSelection(true)
      }
    }

    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === event.pointerId) {
        finishSelection(false)
      }
    }

    cleanupRef.current = () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId)
        frameId = undefined
      }
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', handlePointerUp, true)
      window.removeEventListener('pointercancel', handlePointerCancel, true)
      setSelectionRect(undefined)
    }
    window.addEventListener('pointermove', handlePointerMove, true)
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerCancel, true)
  }, [nodes, onSelectionBoxEnd, onSelectionBoxStart, reactFlowInstanceRef, stageRef])

  return { onPointerDownCapture, selectionRect }
}

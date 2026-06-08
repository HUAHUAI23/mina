import { useCallback } from 'react'
import type {
  Connection,
  EdgeChange,
  IsValidConnection,
  OnEdgesChange,
  OnMove,
} from '@xyflow/react'

import {
  incrementCanvasPerfCounter,
  markCanvasPerformance,
} from '../diagnostics/canvas-performance-marks'
import { getFlowRenderSnapshot, useFlowRenderStore } from '../render/flow-render-store'
import { publishLocalViewport } from '../sync/workflow-presence'
import { useCanvasStore } from '../store/canvas-store'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'

const isMediaFlowNode = (node: WorkflowFlowNode | undefined): boolean =>
  node?.type === 'image_generation' || node?.type === 'video_generation'

export const changedNodeIds = (changes: readonly { id: string; type: string }[]): string[] =>
  changes
    .filter((change) => change.type !== 'select' && change.type !== 'add')
    .map((change) => change.id)

export const useWorkflowConnectionHandlers = () => {
  const applyRenderEdgeChanges = useFlowRenderStore((state) => state.applyEdgeChanges)
  const setLastViewport = useFlowRenderStore((state) => state.setLastViewport)
  const setSelectionDragActive = useFlowRenderStore((state) => state.setSelectionDragActive)
  const setViewportMoving = useFlowRenderStore((state) => state.setViewportMoving)
  const addMediaConnection = useCanvasStore((state) => state.addMediaConnection)
  const removeGraphEdges = useCanvasStore((state) => state.removeGraphEdges)

  const isValidConnection = useCallback<IsValidConnection<WorkflowFlowEdge>>((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return false
    }
    const nodesById = getFlowRenderSnapshot().flowNodesById
    if (!isMediaFlowNode(nodesById[connection.source]) || !isMediaFlowNode(nodesById[connection.target])) {
      return false
    }
    return true
  }, [])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return
      }
      incrementCanvasPerfCounter('documentCommits')
      markCanvasPerformance('document:commit')
      addMediaConnection({
        sourceId: connection.source,
        targetId: connection.target,
        ...(connection.sourceHandle ? { sourceHandle: connection.sourceHandle } : {}),
        ...(connection.targetHandle ? { targetHandle: connection.targetHandle } : {}),
      })
    },
    [addMediaConnection],
  )

  const onEdgesChange = useCallback<OnEdgesChange<WorkflowFlowEdge>>(
    (changes: EdgeChange<WorkflowFlowEdge>[]) => {
      applyRenderEdgeChanges(changes)
      const removedIds = changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id)
      if (removedIds.length > 0) {
        incrementCanvasPerfCounter('documentCommits')
        markCanvasPerformance('document:commit')
        removeGraphEdges(removedIds)
      }
    },
    [applyRenderEdgeChanges, removeGraphEdges],
  )

  const onMove = useCallback<OnMove>((_event, viewport) => {
    publishLocalViewport(viewport)
  }, [])

  const onMoveEnd = useCallback<OnMove>((_event, viewport) => {
    setViewportMoving(false)
    setLastViewport(viewport)
    publishLocalViewport(viewport)
  }, [setLastViewport, setViewportMoving])

  const onMoveStart = useCallback(() => {
    setViewportMoving(true)
  }, [setViewportMoving])

  const onSelectionDragStart = useCallback(() => {
    useCanvasUiStore.getState().closeAddMenu()
    useCanvasUiStore.getState().closeNodePanel()
    setSelectionDragActive(true)
  }, [setSelectionDragActive])

  const onSelectionDragStop = useCallback(() => {
    setSelectionDragActive(false)
  }, [setSelectionDragActive])

  return {
    isValidConnection,
    onConnect,
    onEdgesChange,
    onMove,
    onMoveEnd,
    onMoveStart,
    onSelectionDragStart,
    onSelectionDragStop,
  }
}

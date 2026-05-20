import { useCallback, useRef } from 'react'
import type {
  Connection,
  EdgeChange,
  NodeChange,
  NodeMouseHandler,
  OnEdgesChange,
  OnMove,
  OnNodesChange,
} from '@xyflow/react'

import {
  createNodeDragSession,
  diffNodeFrames,
  frameSnapshotForNodes,
  type NodeDragSession,
} from '../render/drag-session'
import {
  incrementCanvasPerfCounter,
  markCanvasPerformance,
} from '../diagnostics/canvas-performance-marks'
import { getFlowRenderSnapshot, useFlowRenderStore } from '../render/flow-render-store'
import { publishLocalDragging, publishLocalViewport } from '../sync/workflow-presence'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'
import { useCanvasStore } from '../store/canvas-store'

const changedNodeIds = (changes: readonly NodeChange<WorkflowFlowNode>[]): string[] =>
  changes
    .filter((change) => change.type !== 'select' && change.type !== 'add')
    .map((change) => change.id)

const shouldPersistDimensions = (node: WorkflowFlowNode | undefined): boolean =>
  node?.type === 'flow_group' || node?.type === 'node_group'

export const useWorkflowFlowHandlers = () => {
  const dragSession = useRef<NodeDragSession | undefined>(undefined)
  const applyRenderEdgeChanges = useFlowRenderStore((state) => state.applyEdgeChanges)
  const applyRenderNodeChanges = useFlowRenderStore((state) => state.applyNodeChanges)
  const releaseLocalFrameNodeIds = useFlowRenderStore((state) => state.releaseLocalFrameNodeIds)
  const setDraggingNodeIds = useFlowRenderStore((state) => state.setDraggingNodeIds)
  const setLocalFrameNodeIds = useFlowRenderStore((state) => state.setLocalFrameNodeIds)
  const setLastViewport = useFlowRenderStore((state) => state.setLastViewport)
  const setViewportMoving = useFlowRenderStore((state) => state.setViewportMoving)
  const addMediaConnection = useCanvasStore((state) => state.addMediaConnection)
  const commitNodeFrames = useCanvasStore((state) => state.commitNodeFrames)
  const removeGraphEdges = useCanvasStore((state) => state.removeGraphEdges)
  const removeGraphNodes = useCanvasStore((state) => state.removeGraphNodes)
  const setNodeFrame = useCanvasStore((state) => state.setNodeFrame)

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
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

  const onNodesChange = useCallback<OnNodesChange<WorkflowFlowNode>>(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      applyRenderNodeChanges(changes)

      const removedNodeIds = changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id)
      if (removedNodeIds.length > 0) {
        incrementCanvasPerfCounter('documentCommits')
        markCanvasPerformance('document:commit')
        removeGraphNodes(removedNodeIds)
      }

      const flowNodesById = getFlowRenderSnapshot().flowNodesById
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          if (change.dragging) {
            const session = dragSession.current
            if (!session) {
              setLocalFrameNodeIds([change.id])
            }
            if (session) {
              const previous = session.latest[change.id] ?? session.baseline[change.id]
              session.latest = {
                ...session.latest,
                [change.id]: {
                  ...(previous ?? { position: change.position }),
                  position: change.position,
                },
              }
              publishLocalDragging({
                nodeIds: session.nodeIds,
                positions: Object.fromEntries(
                  Object.entries(session.latest).map(([nodeId, frame]) => [nodeId, frame.position]),
                ),
              })
            }
            continue
          }
          if (!dragSession.current) {
            incrementCanvasPerfCounter('documentCommits')
            markCanvasPerformance('document:commit')
            setNodeFrame({ nodeId: change.id, position: change.position })
          }
        }

        if (change.type === 'dimensions' && change.dimensions && shouldPersistDimensions(flowNodesById[change.id])) {
          incrementCanvasPerfCounter('documentCommits')
          markCanvasPerformance('document:commit')
          setNodeFrame({
            height: change.dimensions.height,
            nodeId: change.id,
            width: change.dimensions.width,
          })
        }
      }
    },
    [applyRenderNodeChanges, removeGraphNodes, setLocalFrameNodeIds, setNodeFrame],
  )

  const onNodeDragStart = useCallback<NodeMouseHandler<WorkflowFlowNode>>((_event, node) => {
    const state = getFlowRenderSnapshot()
    const selectedDraggingNodes = state.flowNodes.filter((candidate) => candidate.selected)
    const nodes =
      selectedDraggingNodes.length > 1 && selectedDraggingNodes.some((candidate) => candidate.id === node.id)
        ? selectedDraggingNodes
        : state.flowNodes.filter((candidate) => candidate.id === node.id)
    dragSession.current = createNodeDragSession(nodes)
    setDraggingNodeIds(dragSession.current.nodeIds)
    setLocalFrameNodeIds(dragSession.current.nodeIds)
    markCanvasPerformance('drag:start')
  }, [setDraggingNodeIds, setLocalFrameNodeIds])

  const onNodeDragStop = useCallback<NodeMouseHandler<WorkflowFlowNode>>(() => {
    const session = dragSession.current
    if (!session) {
      return
    }
    const finalFrames = frameSnapshotForNodes(getFlowRenderSnapshot().flowNodesById, session.nodeIds)
    const changedFrames = diffNodeFrames(session.baseline, finalFrames)
    if (changedFrames.length > 0) {
      incrementCanvasPerfCounter('documentCommits')
      markCanvasPerformance('document:commit')
      commitNodeFrames(
        changedFrames.map(({ frame, nodeId }) => ({
          height: frame.height,
          nodeId,
          parentId: frame.parentId,
          position: frame.position,
          width: frame.width,
        })),
      )
    }
    dragSession.current = undefined
    setDraggingNodeIds([])
    window.setTimeout(() => releaseLocalFrameNodeIds(session.nodeIds), 250)
    publishLocalDragging(undefined)
    markCanvasPerformance('drag:stop')
  }, [commitNodeFrames, releaseLocalFrameNodeIds, setDraggingNodeIds])

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

  return {
    changedNodeIds,
    onConnect,
    onEdgesChange,
    onMove,
    onMoveEnd,
    onMoveStart,
    onNodeDragStart,
    onNodeDragStop,
    onNodesChange,
  }
}

export type WorkflowFlowHandlers = ReturnType<typeof useWorkflowFlowHandlers>

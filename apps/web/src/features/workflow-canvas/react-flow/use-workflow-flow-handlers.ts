import { useCallback, useRef } from 'react'
import type {
  NodeChange,
  NodeDimensionChange,
  NodePositionChange,
  NodeMouseHandler,
  OnNodesChange,
} from '@xyflow/react'

import {
  createNodeDragSession,
  frameFromFlowNode,
  type NodeDragSession,
} from '../render/drag-session'
import {
  incrementCanvasPerfCounter,
  markCanvasPerformance,
} from '../diagnostics/canvas-performance-marks'
import { getFlowRenderSnapshot, useFlowRenderStore } from '../render/flow-render-store'
import { publishLocalDragging } from '../sync/workflow-presence'
import type { WorkflowFlowNode } from '../domain/flow-types'
import { useCanvasStore } from '../store/canvas-store'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import {
  absoluteFlowNodePosition,
  resolveGroupAttachTargetForNode,
} from './group-attach-policy'
import { toFlowNode } from './flow-adapters'
import { changedNodeIds, useWorkflowConnectionHandlers } from './use-workflow-connection-handlers'
import { shouldPersistDimensions, useGroupResizePersistence } from './use-group-resize-persistence'

type CompletedResizeChange = NodeDimensionChange & {
  dimensions: NonNullable<NodeDimensionChange['dimensions']>
}

const isCompletedResizeChange = (change: NodeChange<WorkflowFlowNode>): change is CompletedResizeChange =>
  change.type === 'dimensions' && change.resizing === false && Boolean(change.dimensions)

type MeasuredDimensionsChange = NodeDimensionChange & {
  dimensions: NonNullable<NodeDimensionChange['dimensions']>
}

const hasMeasuredDimensions = (change: NodeChange<WorkflowFlowNode>): change is MeasuredDimensionsChange =>
  change.type === 'dimensions' && Boolean(change.dimensions)

type ResizingDimensionsChange = NodeDimensionChange & {
  dimensions: NonNullable<NodeDimensionChange['dimensions']>
  resizing: true
}

const isResizingDimensionsChange = (change: NodeChange<WorkflowFlowNode>): change is ResizingDimensionsChange =>
  change.type === 'dimensions' && change.resizing === true && Boolean(change.dimensions)

type PositionedNodeChange = NodePositionChange & {
  position: NonNullable<NodePositionChange['position']>
}

const isPositionedNodeChange = (change: NodeChange<WorkflowFlowNode>): change is PositionedNodeChange =>
  change.type === 'position' && Boolean(change.position)

const sessionDraggedNodeIds = (session: NodeDragSession): string[] =>
  session.draggedNodeIds.length > 0 ? session.draggedNodeIds : session.nodeIds

const sessionOwnsDraggedNode = (session: NodeDragSession | undefined, nodeId: string): session is NodeDragSession =>
  Boolean(session && sessionDraggedNodeIds(session).includes(nodeId))

export const useWorkflowFlowHandlers = () => {
  const dragSession = useRef<NodeDragSession | undefined>(undefined)
  const applyRenderNodeChanges = useFlowRenderStore((state) => state.applyNodeChanges)
  const releaseLocalFrameNodeIds = useFlowRenderStore((state) => state.releaseLocalFrameNodeIds)
  const setDraggingNodeIds = useFlowRenderStore((state) => state.setDraggingNodeIds)
  const setLocalFrameNodeIds = useFlowRenderStore((state) => state.setLocalFrameNodeIds)
  const setSelectionDragActive = useFlowRenderStore((state) => state.setSelectionDragActive)
  const addNodesToGroup = useCanvasStore((state) => state.addNodesToGroup)
  const removeGraphNodes = useCanvasStore((state) => state.removeGraphNodes)
  const setNodeFrame = useCanvasStore((state) => state.setNodeFrame)
  const connectionHandlers = useWorkflowConnectionHandlers()
  const {
    commitDragSessionFrames,
    commitResizeSession,
    mergeChildFrameIntoResizeSession,
    mergeResizeSessionFrame,
    resizeSessionIncludes,
  } = useGroupResizePersistence()

  const onNodesChange = useCallback<OnNodesChange<WorkflowFlowNode>>(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      const beforeFlowNodesById = getFlowRenderSnapshot().flowNodesById
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
      const resizingNodeIds = new Set(changes
        .filter(isResizingDimensionsChange)
        .map((change) => change.id))
      const completedResizeNodeIds = new Set(changes
        .filter(isCompletedResizeChange)
        .map((change) => change.id))
      const resizeOwnerNodeIds = new Set([...resizingNodeIds, ...completedResizeNodeIds])
      const completedResizeSessions = new Set<NodeDragSession>()

      for (const change of changes) {
        if (isPositionedNodeChange(change)) {
          const changedNode = flowNodesById[change.id] ?? beforeFlowNodesById[change.id]
          if (changedNode?.parentId && resizeOwnerNodeIds.has(changedNode.parentId)) {
            mergeChildFrameIntoResizeSession(changedNode.parentId, change.id, { position: change.position }, beforeFlowNodesById)
            continue
          }
          if (resizeSessionIncludes(change.id) || resizingNodeIds.has(change.id) || completedResizeNodeIds.has(change.id)) {
            mergeResizeSessionFrame(change.id, { position: change.position }, beforeFlowNodesById)
            continue
          }
          if (change.dragging) {
            let session = dragSession.current
            if (!session) {
              const documentNode = useCanvasStore.getState().nodes.find((candidate) => candidate.id === change.id)
              if (documentNode) {
                session = createNodeDragSession([toFlowNode(documentNode)])
                dragSession.current = session
                setDraggingNodeIds(sessionDraggedNodeIds(session))
              }
              setLocalFrameNodeIds([change.id])
            }
            if (session) {
              if (sessionOwnsDraggedNode(session, change.id)) {
                const previous = session.latest[change.id] ?? session.baseline[change.id]
                session.latest = {
                  ...session.latest,
                  [change.id]: {
                    ...(previous ?? { position: change.position }),
                    position: change.position,
                  },
                }
                publishLocalDragging({
                  nodeIds: sessionDraggedNodeIds(session),
                  positions: Object.fromEntries(
                    sessionDraggedNodeIds(session)
                      .map((nodeId) => {
                        const frame = session.latest[nodeId] ?? session.baseline[nodeId]
                        return frame ? ([nodeId, frame.position] as const) : undefined
                      })
                      .filter((entry): entry is readonly [string, { x: number; y: number }] => Boolean(entry)),
                  ),
                })
              }
            }
            continue
          }
          if (dragSession.current) {
            const session = dragSession.current
            const draggedNodes = sessionDraggedNodeIds(session)
              .map((draggedNodeId) => flowNodesById[draggedNodeId] ?? beforeFlowNodesById[draggedNodeId])
              .filter((candidate): candidate is WorkflowFlowNode => Boolean(candidate))
            if (draggedNodes.some((draggedNode) => draggedNode.parentId === change.id || draggedNode.id === change.id)) {
              const beforeNode = beforeFlowNodesById[change.id]
              const currentNode = flowNodesById[change.id]
              if (beforeNode && currentNode) {
                session.baseline = {
                  ...session.baseline,
                  [change.id]: session.baseline[change.id] ?? frameFromFlowNode(beforeNode),
                }
                session.latest = {
                  ...session.latest,
                  [change.id]: {
                    ...(session.latest[change.id] ?? session.baseline[change.id] ?? frameFromFlowNode(beforeNode)),
                    position: currentNode.position,
                  },
                }
                if (!session.nodeIds.includes(change.id)) {
                  session.nodeIds = [...session.nodeIds, change.id]
                  setLocalFrameNodeIds(session.nodeIds)
                }
              }
              continue
            }
          }
          if (!dragSession.current) {
            incrementCanvasPerfCounter('documentCommits')
            markCanvasPerformance('document:commit')
            setNodeFrame({ nodeId: change.id, position: change.position })
            continue
          }
          const session = dragSession.current
          if (sessionOwnsDraggedNode(session, change.id)) {
            const previous = session.latest[change.id] ?? session.baseline[change.id]
            session.latest = {
              ...session.latest,
              [change.id]: {
                ...(previous ?? { position: change.position }),
                position: change.position,
              },
            }
          }
        }

        if (isResizingDimensionsChange(change) && shouldPersistDimensions(flowNodesById[change.id])) {
          mergeResizeSessionFrame(
            change.id,
            {
              height: change.dimensions.height,
              width: change.dimensions.width,
            },
            beforeFlowNodesById,
          )
          continue
        }

        if (hasMeasuredDimensions(change) && shouldPersistDimensions(flowNodesById[change.id])) {
          const session = dragSession.current
          if (session && change.resizing !== false) {
            const currentNode = getFlowRenderSnapshot().flowNodesById[change.id] ?? flowNodesById[change.id]
            const beforeNode = beforeFlowNodesById[change.id]
            if (currentNode && beforeNode && sessionDraggedNodeIds(session).some((draggedNodeId) => {
              const draggedNode = flowNodesById[draggedNodeId] ?? beforeFlowNodesById[draggedNodeId]
              return draggedNode?.parentId === change.id || draggedNodeId === change.id
            })) {
              const previous = session.latest[change.id] ?? session.baseline[change.id] ?? frameFromFlowNode(beforeNode)
              session.baseline = {
                ...session.baseline,
                [change.id]: session.baseline[change.id] ?? frameFromFlowNode(beforeNode),
              }
              session.latest = {
                ...session.latest,
                [change.id]: {
                  ...previous,
                  height: change.dimensions.height,
                  width: change.dimensions.width,
                },
              }
              if (!session.nodeIds.includes(change.id)) {
                session.nodeIds = [...session.nodeIds, change.id]
                setLocalFrameNodeIds(session.nodeIds)
              }
            }
            continue
          }
        }

        if (isCompletedResizeChange(change) && shouldPersistDimensions(flowNodesById[change.id])) {
          const currentNode = getFlowRenderSnapshot().flowNodesById[change.id] ?? flowNodesById[change.id]
          const session = mergeResizeSessionFrame(
            change.id,
            {
              height: change.dimensions.height,
              ...(currentNode ? { position: currentNode.position } : {}),
              width: change.dimensions.width,
            },
            beforeFlowNodesById,
          )
          if (session) {
            completedResizeSessions.add(session)
            continue
          }
          incrementCanvasPerfCounter('documentCommits')
          markCanvasPerformance('document:commit')
          setNodeFrame({
            height: change.dimensions.height,
            nodeId: change.id,
            width: change.dimensions.width,
          })
        }
      }

      for (const session of completedResizeSessions) {
        commitResizeSession(session)
      }
    },
    [
      applyRenderNodeChanges,
      commitResizeSession,
      mergeChildFrameIntoResizeSession,
      mergeResizeSessionFrame,
      removeGraphNodes,
      setDraggingNodeIds,
      setLocalFrameNodeIds,
      setNodeFrame,
    ],
  )

  const onNodeDragStart = useCallback<NodeMouseHandler<WorkflowFlowNode>>((_event, node) => {
    const state = getFlowRenderSnapshot()
    const selectedDraggingNodes = state.flowNodes.filter((candidate) => candidate.selected)
    const nodes =
      selectedDraggingNodes.length > 1 && selectedDraggingNodes.some((candidate) => candidate.id === node.id)
        ? selectedDraggingNodes
        : state.flowNodes.filter((candidate) => candidate.id === node.id)
    dragSession.current = createNodeDragSession(nodes)
    if (dragSession.current.nodeIds.length > 1) {
      useCanvasUiStore.getState().closeAddMenu()
      useCanvasUiStore.getState().closeNodePanel()
      setSelectionDragActive(true)
    }
    setDraggingNodeIds(sessionDraggedNodeIds(dragSession.current))
    setLocalFrameNodeIds(dragSession.current.nodeIds)
    markCanvasPerformance('drag:start')
  }, [setDraggingNodeIds, setLocalFrameNodeIds, setSelectionDragActive])

  const onNodeDragStop = useCallback<NodeMouseHandler<WorkflowFlowNode>>((_event, node) => {
    const session = dragSession.current
    if (!session) {
      return
    }
    const snapshot = getFlowRenderSnapshot()
    const targetGroup = session.nodeIds.length === 1
      ? resolveGroupAttachTargetForNode(snapshot.flowNodesById[node.id] ?? node, snapshot.flowNodes)
      : undefined
    if (targetGroup) {
      dragSession.current = undefined
      setDraggingNodeIds([])
      releaseLocalFrameNodeIds(session.nodeIds)
      publishLocalDragging(undefined)
      incrementCanvasPerfCounter('documentCommits')
      markCanvasPerformance('document:commit')
      const draggedNode = snapshot.flowNodesById[node.id] ?? node
      addNodesToGroup(targetGroup.id, [node.id], {
        absolutePositionsByNodeId: {
          [node.id]: absoluteFlowNodePosition(draggedNode, new Map(snapshot.flowNodes.map((candidate) => [candidate.id, candidate]))),
        },
      })
      markCanvasPerformance('drag:stop')
      return
    }

    commitDragSessionFrames(session)
    dragSession.current = undefined
    setDraggingNodeIds([])
    if (sessionDraggedNodeIds(session).length > 1) {
      setSelectionDragActive(false)
    }
    window.setTimeout(() => releaseLocalFrameNodeIds(session.nodeIds), 250)
    publishLocalDragging(undefined)
    markCanvasPerformance('drag:stop')
  }, [addNodesToGroup, commitDragSessionFrames, releaseLocalFrameNodeIds, setDraggingNodeIds, setSelectionDragActive])

  return {
    changedNodeIds,
    ...connectionHandlers,
    onNodeDragStart,
    onNodeDragStop,
    onNodesChange,
  }
}

export type WorkflowFlowHandlers = ReturnType<typeof useWorkflowFlowHandlers>

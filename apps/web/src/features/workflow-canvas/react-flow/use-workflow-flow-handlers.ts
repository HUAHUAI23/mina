import { useCallback, useRef } from 'react'
import type { Connection, EdgeChange, NodeChange, OnEdgesChange, OnNodesChange } from '@xyflow/react'

import type { WorkflowFlowNode, WorkflowFlowEdge } from '../domain/flow-types'
import { useCanvasStore } from '../store/canvas-store'

const changedNodeIds = (changes: readonly NodeChange<WorkflowFlowNode>[]): string[] =>
  changes
    .filter((change) => change.type !== 'select' && change.type !== 'add')
    .map((change) => change.id)

export const useWorkflowFlowHandlers = () => {
  const draggingNodeIds = useRef(new Set<string>())
  const addMediaConnection = useCanvasStore((state) => state.addMediaConnection)
  const removeGraphEdges = useCanvasStore((state) => state.removeGraphEdges)
  const removeGraphNodes = useCanvasStore((state) => state.removeGraphNodes)
  const setNodeFrame = useCanvasStore((state) => state.setNodeFrame)

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return
      }
      addMediaConnection({
        sourceId: connection.source,
        targetId: connection.target,
        ...(connection.sourceHandle
          ? { sourceHandle: connection.sourceHandle }
          : {}),
        ...(connection.targetHandle
          ? { targetHandle: connection.targetHandle }
          : {}),
      })
    },
    [addMediaConnection],
  )

  const onEdgesChange = useCallback<OnEdgesChange<WorkflowFlowEdge>>(
    (changes: EdgeChange<WorkflowFlowEdge>[]) => {
      const removedIds = changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id)
      if (removedIds.length > 0) {
        removeGraphEdges(removedIds)
      }
    },
    [removeGraphEdges],
  )

  const onNodesChange = useCallback<OnNodesChange<WorkflowFlowNode>>(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      const removedNodeIds = changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id)
      if (removedNodeIds.length > 0) {
        removeGraphNodes(removedNodeIds)
      }

      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          if (change.dragging) {
            draggingNodeIds.current.add(change.id)
            continue
          }
          if (draggingNodeIds.current.has(change.id)) {
            draggingNodeIds.current.delete(change.id)
          }
          setNodeFrame({ nodeId: change.id, position: change.position })
        }

        if (change.type === 'dimensions' && change.dimensions) {
          setNodeFrame({
            nodeId: change.id,
            height: change.dimensions.height,
            width: change.dimensions.width,
          })
        }
      }
    },
    [removeGraphNodes, setNodeFrame],
  )

  return {
    changedNodeIds,
    onConnect,
    onEdgesChange,
    onNodesChange,
  }
}

export type WorkflowFlowHandlers = ReturnType<typeof useWorkflowFlowHandlers>

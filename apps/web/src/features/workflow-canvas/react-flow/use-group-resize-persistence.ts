import { useCallback, useRef } from 'react'

import {
  createNodeDragSession,
  diffNodeFrames,
  frameFromFlowNode,
  frameSnapshotForNodes,
  type NodeDragSession,
  type NodeFrameSnapshot,
} from '../render/drag-session'
import {
  incrementCanvasPerfCounter,
  markCanvasPerformance,
} from '../diagnostics/canvas-performance-marks'
import { getFlowRenderSnapshot, useFlowRenderStore } from '../render/flow-render-store'
import { useCanvasStore } from '../store/canvas-store'
import type { WorkflowFlowNode } from '../domain/flow-types'

export type ResizeFramePatch = Partial<Pick<NodeFrameSnapshot, 'height' | 'position' | 'width'>>

const shouldPersistDimensions = (node: WorkflowFlowNode | undefined): boolean =>
  node?.type === 'flow_group' || node?.type === 'node_group' || node?.type === 'text'

export const useGroupResizePersistence = () => {
  const resizeSession = useRef<NodeDragSession | undefined>(undefined)
  const commitNodeFrames = useCanvasStore((state) => state.commitNodeFrames)
  const releaseLocalFrameNodeIds = useFlowRenderStore((state) => state.releaseLocalFrameNodeIds)
  const setLocalFrameNodeIds = useFlowRenderStore((state) => state.setLocalFrameNodeIds)

  const commitDragSessionFrames = useCallback((session: NodeDragSession): boolean => {
    const snapshot = getFlowRenderSnapshot()
    const sessionNodeIds = Array.from(new Set([...session.nodeIds, ...Object.keys(session.latest)]))
    const finalFrames = {
      ...frameSnapshotForNodes(snapshot.flowNodesById, sessionNodeIds),
      ...session.latest,
    }
    const changedFrames = diffNodeFrames(session.baseline, finalFrames)
    if (changedFrames.length === 0) {
      return false
    }
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
    return true
  }, [commitNodeFrames])

  const ensureResizeSession = useCallback((nodeId: string, beforeFlowNodesById: Record<string, WorkflowFlowNode>): NodeDragSession | undefined => {
    let session = resizeSession.current
    if (session?.nodeIds.includes(nodeId)) {
      return session
    }
    const node = beforeFlowNodesById[nodeId] ?? getFlowRenderSnapshot().flowNodesById[nodeId]
    if (!node || !shouldPersistDimensions(node)) {
      return undefined
    }
    session = createNodeDragSession([node])
    resizeSession.current = session
    setLocalFrameNodeIds(session.nodeIds)
    markCanvasPerformance('resize:start')
    return session
  }, [setLocalFrameNodeIds])

  const mergeResizeSessionFrame = useCallback((
    nodeId: string,
    patch: ResizeFramePatch,
    beforeFlowNodesById: Record<string, WorkflowFlowNode>,
  ): NodeDragSession | undefined => {
    const session = ensureResizeSession(nodeId, beforeFlowNodesById)
    if (!session) {
      return undefined
    }
    const beforeNode = beforeFlowNodesById[nodeId] ?? getFlowRenderSnapshot().flowNodesById[nodeId]
    const baseFrame = session.latest[nodeId] ?? session.baseline[nodeId] ?? (beforeNode ? frameFromFlowNode(beforeNode) : undefined)
    if (!baseFrame) {
      return session
    }
    session.latest = {
      ...session.latest,
      [nodeId]: {
        ...baseFrame,
        ...patch,
      },
    }
    return session
  }, [ensureResizeSession])

  const mergeChildFrameIntoResizeSession = useCallback((
    parentNodeId: string,
    nodeId: string,
    patch: ResizeFramePatch,
    beforeFlowNodesById: Record<string, WorkflowFlowNode>,
  ): NodeDragSession | undefined => {
    const session = ensureResizeSession(parentNodeId, beforeFlowNodesById)
    if (!session) {
      return undefined
    }
    const beforeNode = beforeFlowNodesById[nodeId] ?? getFlowRenderSnapshot().flowNodesById[nodeId]
    const baseFrame = session.latest[nodeId] ?? session.baseline[nodeId] ?? (beforeNode ? frameFromFlowNode(beforeNode) : undefined)
    if (!baseFrame) {
      return session
    }
    session.baseline = {
      ...session.baseline,
      [nodeId]: session.baseline[nodeId] ?? baseFrame,
    }
    session.latest = {
      ...session.latest,
      [nodeId]: {
        ...baseFrame,
        ...patch,
      },
    }
    if (!session.nodeIds.includes(nodeId)) {
      session.nodeIds = [...session.nodeIds, nodeId]
      setLocalFrameNodeIds(session.nodeIds)
    }
    return session
  }, [ensureResizeSession, setLocalFrameNodeIds])

  const commitResizeSession = useCallback((session: NodeDragSession): void => {
    commitDragSessionFrames(session)
    resizeSession.current = undefined
    window.setTimeout(() => releaseLocalFrameNodeIds(session.nodeIds), 250)
    markCanvasPerformance('resize:stop')
  }, [commitDragSessionFrames, releaseLocalFrameNodeIds])

  const resizeSessionIncludes = useCallback((nodeId: string): boolean =>
    Boolean(resizeSession.current?.nodeIds.includes(nodeId)), [])

  return {
    commitDragSessionFrames,
    commitResizeSession,
    mergeChildFrameIntoResizeSession,
    mergeResizeSessionFrame,
    resizeSessionIncludes,
  }
}

export { shouldPersistDimensions }

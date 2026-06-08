import type { XYPosition } from '@xyflow/react'

import type { WorkflowFlowNode } from '../domain/flow-types'

export interface NodeFrameSnapshot {
  height?: number | undefined
  parentId?: string | undefined
  position: XYPosition
  width?: number | undefined
}

export interface NodeDragSession {
  baseline: Record<string, NodeFrameSnapshot>
  draggedNodeIds: string[]
  latest: Record<string, NodeFrameSnapshot>
  nodeIds: string[]
  startedAt: number
}

export const frameFromFlowNode = (node: WorkflowFlowNode): NodeFrameSnapshot => ({
  height: node.height ?? node.measured?.height,
  parentId: node.parentId,
  position: node.position,
  width: node.width ?? node.measured?.width,
})

export const createNodeDragSession = (
  nodes: readonly WorkflowFlowNode[],
  draggedNodeIds: readonly string[] = nodes.map((node) => node.id),
): NodeDragSession => {
  const baseline = Object.fromEntries(nodes.map((node) => [node.id, frameFromFlowNode(node)]))
  return {
    baseline,
    draggedNodeIds: Array.from(new Set(draggedNodeIds)),
    latest: baseline,
    nodeIds: nodes.map((node) => node.id),
    startedAt: performance.now(),
  }
}

export const diffNodeFrames = (
  baseline: Record<string, NodeFrameSnapshot>,
  finalFrames: Record<string, NodeFrameSnapshot>,
): Array<{ frame: NodeFrameSnapshot; nodeId: string }> => {
  const changed: Array<{ frame: NodeFrameSnapshot; nodeId: string }> = []
  for (const [nodeId, frame] of Object.entries(finalFrames)) {
    const before = baseline[nodeId]
    if (!before) {
      changed.push({ frame, nodeId })
      continue
    }
    if (
      before.position.x !== frame.position.x ||
      before.position.y !== frame.position.y ||
      before.parentId !== frame.parentId ||
      before.width !== frame.width ||
      before.height !== frame.height
    ) {
      changed.push({ frame, nodeId })
    }
  }
  return changed
}

export const frameSnapshotForNodes = (
  nodesById: Record<string, WorkflowFlowNode>,
  nodeIds: readonly string[],
): Record<string, NodeFrameSnapshot> =>
  Object.fromEntries(
    nodeIds
      .map((nodeId) => {
        const node = nodesById[nodeId]
        return node ? ([nodeId, frameFromFlowNode(node)] as const) : undefined
      })
      .filter((entry): entry is readonly [string, NodeFrameSnapshot] => Boolean(entry)),
  )

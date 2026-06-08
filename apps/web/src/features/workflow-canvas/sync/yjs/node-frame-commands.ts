import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import {
  applyFrameToNode,
  changedFrameNodes,
  fitGroupsToChildren,
  nodeFrameChanged,
} from '../../domain/group-graph-commands'
import type { CanvasNodeFramePatch } from '../../store/store-types'

const isFinitePosition = (position: { x: number; y: number } | undefined): boolean =>
  position === undefined || (Number.isFinite(position.x) && Number.isFinite(position.y))

const isPositiveFiniteDimension = (value: number | undefined): boolean =>
  value === undefined || (Number.isFinite(value) && value > 0)

const isValidParentId = (parentId: string | undefined): boolean =>
  parentId === undefined || parentId.length > 0

export const resolveCommittedNodeFrameNodes = (
  nodes: readonly WorkflowCanvasNode[],
  frames: readonly CanvasNodeFramePatch[],
): WorkflowCanvasNode[] => {
  if (frames.length === 0) {
    return []
  }
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const validFrames = frames.filter((frame) => {
    if (!nodesById.has(frame.nodeId)) {
      return false
    }
    return (
      isFinitePosition(frame.position) &&
      isPositiveFiniteDimension(frame.width) &&
      isPositiveFiniteDimension(frame.height) &&
      isValidParentId(frame.parentId)
    )
  })
  if (validFrames.length === 0) {
    return []
  }

  const nextNodesById = new Map(nodes.map((node) => [node.id, structuredClone(node)]))
  for (const frame of validFrames) {
    const current = nextNodesById.get(frame.nodeId)
    if (!current) {
      continue
    }
    nextNodesById.set(frame.nodeId, applyFrameToNode(current, frame))
  }

  const currentGroupIds = Array.from(new Set(
    Array.from(nextNodesById.values())
      .map((node) => node.parentId)
      .filter((parentId): parentId is string => Boolean(parentId)),
  ))
  const fittedNodes = fitGroupsToChildren(Array.from(nextNodesById.values()), currentGroupIds)
  nextNodesById.clear()
  for (const node of fittedNodes) {
    nextNodesById.set(node.id, node)
  }

  const changedNodeIdsForFrames = new Set(validFrames.map((frame) => frame.nodeId))
  for (const node of nextNodesById.values()) {
    const current = nodesById.get(node.id)
    if (nodeFrameChanged(current, node)) {
      changedNodeIdsForFrames.add(node.id)
    }
  }

  return Array.from(changedNodeIdsForFrames)
    .map((nodeId) => nextNodesById.get(nodeId) ?? nodesById.get(nodeId))
    .filter((node): node is WorkflowCanvasNode => Boolean(node))
}

export const changedFrameNodesForGraph = changedFrameNodes

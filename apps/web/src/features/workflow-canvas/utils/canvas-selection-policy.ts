import type { XYPosition } from '@xyflow/react'

import {
  getWorkflowNodeBounds,
  getWorkflowNodesBoundsUnion,
  getWorkflowNodeSize,
  type CanvasNodeBounds,
} from '../domain/canvas-node-geometry'
import type { WorkflowFlowNode } from '../domain/flow-types'
import type { CanvasDomScope } from './canvas-dom-scope'

interface FlowSelectionRect {
  bottom: number
  left: number
  right: number
  top: number
}

export interface ScreenSelectionRect {
  height: number
  left: number
  top: number
  width: number
}

const absoluteFlowNodePosition = (
  node: WorkflowFlowNode,
  nodeMap: ReadonlyMap<string, WorkflowFlowNode>,
): XYPosition => {
  let current: WorkflowFlowNode | undefined = node
  let x = current.position.x
  let y = current.position.y
  while (current.parentId) {
    const parent = nodeMap.get(current.parentId)
    if (!parent) {
      break
    }
    x += parent.position.x
    y += parent.position.y
    current = parent
  }
  return { x, y }
}

const hasSelectedAncestor = (
  node: WorkflowFlowNode,
  selectedIds: ReadonlySet<string>,
  nodeMap: ReadonlyMap<string, WorkflowFlowNode>,
): boolean => {
  let parentId = node.parentId
  while (parentId) {
    if (selectedIds.has(parentId)) {
      return true
    }
    parentId = nodeMap.get(parentId)?.parentId
  }
  return false
}

export const normalizeSelectedFlowNodesForBounds = (
  nodes: readonly WorkflowFlowNode[],
  selectedNodeIds: readonly string[],
): WorkflowFlowNode[] => {
  if (selectedNodeIds.length === 0) {
    return []
  }
  const selectedIds = new Set(selectedNodeIds)
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  return nodes
    .filter((node) => selectedIds.has(node.id))
    .filter((node) => !hasSelectedAncestor(node, selectedIds, nodeMap))
}

export const getSelectedFlowNodesBounds = (
  nodes: readonly WorkflowFlowNode[],
  selectedNodeIds: readonly string[],
): CanvasNodeBounds | undefined => {
  const selectedNodes = normalizeSelectedFlowNodesForBounds(nodes, selectedNodeIds)
  if (selectedNodes.length < 2) {
    return undefined
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  return getWorkflowNodesBoundsUnion(selectedNodes, nodeMap)
}

export const createFlowSelectionRect = (
  start: XYPosition,
  end: XYPosition,
): FlowSelectionRect => ({
  bottom: Math.max(start.y, end.y),
  left: Math.min(start.x, end.x),
  right: Math.max(start.x, end.x),
  top: Math.min(start.y, end.y),
})

export const createScreenSelectionRect = (
  start: XYPosition,
  end: XYPosition,
): ScreenSelectionRect => ({
  height: Math.abs(end.y - start.y),
  left: Math.min(start.x, end.x),
  top: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
})

const intersectsSelectionRect = (
  selectionRect: FlowSelectionRect,
  nodePosition: XYPosition,
  nodeSize: { height: number; width: number },
): boolean => {
  const bounds = getWorkflowNodeBounds(
    {
      position: nodePosition,
      type: 'text',
      ...nodeSize,
    },
    nodePosition,
  )
  return (
    selectionRect.left <= bounds.right &&
    selectionRect.right >= bounds.left &&
    selectionRect.top <= bounds.bottom &&
    selectionRect.bottom >= bounds.top
  )
}

const belongsToScope = (node: WorkflowFlowNode, scope: CanvasDomScope): boolean => {
  if (scope.scope === 'root') {
    return !node.parentId
  }
  return node.parentId === scope.scopeNodeId
}

export const resolveNodeIdsInFlowSelectionRect = (
  nodes: readonly WorkflowFlowNode[],
  scope: CanvasDomScope,
  selectionRect: FlowSelectionRect,
): string[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  return nodes
    .filter((node) => belongsToScope(node, scope))
    .filter((node) =>
      intersectsSelectionRect(
        selectionRect,
        absoluteFlowNodePosition(node, nodeMap),
        getWorkflowNodeSize(node),
      ))
    .map((node) => node.id)
}

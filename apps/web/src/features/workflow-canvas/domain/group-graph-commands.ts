import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import {
  isWorkflowGroupNode,
  type WorkflowGroupNodeType,
} from '@mina/contracts/modules/canvas/group-conversion'

import {
  getAbsoluteWorkflowNodePosition,
  getLogicalGroupFrameFromChildren,
  getWorkflowNodesBoundsUnion,
  WORKFLOW_GROUP_PADDING_BOTTOM,
  WORKFLOW_GROUP_PADDING_TOP,
  WORKFLOW_GROUP_PADDING_X,
} from './canvas-node-geometry'

interface WorkflowNodeFramePatch {
  height?: number | undefined
  parentId?: string | undefined
  position?: WorkflowCanvasNode['position'] | undefined
  width?: number | undefined
}

export const canCreateNestedWorkflowGroup = false

export const canGroupNodesAtParent = (parentId: string | undefined): boolean =>
  canCreateNestedWorkflowGroup || !parentId

export const absoluteNodePosition = (
  node: WorkflowCanvasNode,
  nodeMap: Map<string, WorkflowCanvasNode>,
): { x: number; y: number } => {
  return getAbsoluteWorkflowNodePosition(node, nodeMap)
}

export const clearParentFrame = (node: WorkflowCanvasNode): WorkflowCanvasNode => {
  const { extent: _extent, parentId: _parentId, ...rest } = node
  return rest
}

export const withParentFrame = (
  node: WorkflowCanvasNode,
  parentId: string,
  position: WorkflowCanvasNode['position'],
): WorkflowCanvasNode => ({
  ...node,
  extent: 'parent',
  parentId,
  position,
})

export const placeNodeInsideParent = (
  node: WorkflowCanvasNode,
  parentNode: WorkflowCanvasNode,
  absolutePosition: WorkflowCanvasNode['position'],
  nodeMap: Map<string, WorkflowCanvasNode>,
): WorkflowCanvasNode => {
  const parentPosition = absoluteNodePosition(parentNode, nodeMap)
  return withParentFrame(
    node,
    parentNode.id,
    {
      x: absolutePosition.x - parentPosition.x,
      y: absolutePosition.y - parentPosition.y,
    },
  )
}

export const fitGroupFrameToChildren = (
  groupNode: WorkflowCanvasNode,
  childNodes: readonly WorkflowCanvasNode[],
  nodeMap: Map<string, WorkflowCanvasNode>,
): { children: WorkflowCanvasNode[]; group: WorkflowCanvasNode } => {
  if (childNodes.length === 0) {
    return { children: [], group: groupNode }
  }
  const bounds = getWorkflowNodesBoundsUnion(childNodes, nodeMap)
  if (!bounds) {
    return { children: [...childNodes], group: groupNode }
  }
  const frame = getLogicalGroupFrameFromChildren(bounds)
  const groupAbsolutePosition = absoluteNodePosition(groupNode, nodeMap)
  const delta = {
    x: frame.absolutePosition.x - groupAbsolutePosition.x,
    y: frame.absolutePosition.y - groupAbsolutePosition.y,
  }
  const nextPosition = groupNode.parentId
    ? {
        x: groupNode.position.x + delta.x,
        y: groupNode.position.y + delta.y,
      }
    : frame.absolutePosition
  return {
    children: childNodes.map((child) => ({
      ...child,
      position: {
        x: child.position.x - delta.x,
        y: child.position.y - delta.y,
      },
    })),
    group: {
      ...groupNode,
      height: frame.height,
      position: nextPosition,
      width: frame.width,
    },
  }
}

const ensureGroupContainsChildren = (
  groupNode: WorkflowCanvasNode,
  childNodes: readonly WorkflowCanvasNode[],
  nodeMap: Map<string, WorkflowCanvasNode>,
): { children: WorkflowCanvasNode[]; group: WorkflowCanvasNode } => {
  if (childNodes.length === 0) {
    return { children: [], group: groupNode }
  }
  const childBounds = getWorkflowNodesBoundsUnion(childNodes, nodeMap)
  if (!childBounds) {
    return { children: [...childNodes], group: groupNode }
  }
  const groupPosition = absoluteNodePosition(groupNode, nodeMap)
  const groupWidth = groupNode.width ?? 520
  const groupHeight = groupNode.height ?? 300
  const nextLeft = Math.min(groupPosition.x, childBounds.left - WORKFLOW_GROUP_PADDING_X)
  const nextTop = Math.min(groupPosition.y, childBounds.top - WORKFLOW_GROUP_PADDING_TOP)
  const nextRight = Math.max(groupPosition.x + groupWidth, childBounds.right + WORKFLOW_GROUP_PADDING_X)
  const nextBottom = Math.max(groupPosition.y + groupHeight, childBounds.bottom + WORKFLOW_GROUP_PADDING_BOTTOM)
  const delta = {
    x: nextLeft - groupPosition.x,
    y: nextTop - groupPosition.y,
  }
  if (
    delta.x === 0 &&
    delta.y === 0 &&
    nextRight === groupPosition.x + groupWidth &&
    nextBottom === groupPosition.y + groupHeight
  ) {
    return { children: [...childNodes], group: groupNode }
  }
  return {
    children: childNodes.map((child) => ({
      ...child,
      position: {
        x: child.position.x - delta.x,
        y: child.position.y - delta.y,
      },
    })),
    group: {
      ...groupNode,
      height: nextBottom - nextTop,
      position: groupNode.parentId
        ? {
            x: groupNode.position.x + delta.x,
            y: groupNode.position.y + delta.y,
          }
        : {
            x: nextLeft,
            y: nextTop,
          },
      width: nextRight - nextLeft,
    },
  }
}

const nodeDepth = (
  node: WorkflowCanvasNode,
  nodeMap: ReadonlyMap<string, WorkflowCanvasNode>,
): number => {
  let depth = 0
  let parentId = node.parentId
  while (parentId) {
    const parent = nodeMap.get(parentId)
    if (!parent) {
      break
    }
    depth += 1
    parentId = parent.parentId
  }
  return depth
}

export const fitGroupsToChildren = (
  nodes: readonly WorkflowCanvasNode[],
  groupIds?: Iterable<string> | undefined,
  options: { mode?: 'ensure' | 'fit' | undefined } = {},
): WorkflowCanvasNode[] => {
  let nextNodes = [...nodes]
  const mode = options.mode ?? 'ensure'
  const initialNodeMap = new Map(nextNodes.map((node) => [node.id, node]))
  const targetGroupIds = Array.from(new Set(groupIds ?? nextNodes
    .filter((node) => isWorkflowGroupNode(node))
    .map((node) => node.id)))
    .filter((groupId) => isWorkflowGroupNode(initialNodeMap.get(groupId)))
    .sort((left, right) => {
      const leftNode = initialNodeMap.get(left)
      const rightNode = initialNodeMap.get(right)
      return (rightNode ? nodeDepth(rightNode, initialNodeMap) : 0) -
        (leftNode ? nodeDepth(leftNode, initialNodeMap) : 0)
    })

  for (const groupId of targetGroupIds) {
    const nodeMap = new Map(nextNodes.map((node) => [node.id, node]))
    const groupNode = nodeMap.get(groupId)
    if (!isWorkflowGroupNode(groupNode)) {
      continue
    }
    const childNodes = nextNodes.filter((node) => node.parentId === groupId)
    if (childNodes.length === 0) {
      continue
    }
    const groupFrame = mode === 'fit'
      ? fitGroupFrameToChildren(groupNode, childNodes, nodeMap)
      : ensureGroupContainsChildren(groupNode, childNodes, nodeMap)
    const nextChildrenById = new Map(groupFrame.children.map((node) => [node.id, node]))
    nextNodes = nextNodes.map((node) => {
      if (node.id === groupId) {
        return groupFrame.group
      }
      return nextChildrenById.get(node.id) ?? node
    })
  }

  return sortGroupNodesBeforeChildren(nextNodes)
}

const sortGroupNodesBeforeChildren = (nodes: readonly WorkflowCanvasNode[]): WorkflowCanvasNode[] => {
  const ordered: WorkflowCanvasNode[] = []
  const pending = new Map(nodes.map((node) => [node.id, node]))
  while (pending.size > 0) {
    let progressed = false
    for (const node of Array.from(pending.values())) {
      if (!node.parentId || !pending.has(node.parentId)) {
        ordered.push(node)
        pending.delete(node.id)
        progressed = true
      }
    }
    if (!progressed) {
      ordered.push(...pending.values())
      break
    }
  }
  return ordered
}

export const nextGroupTitle = (type: WorkflowGroupNodeType): string =>
  type === 'flow_group' ? 'Flow Group' : 'Node Group'

const nearestPreservedParentId = (
  node: WorkflowCanvasNode,
  nodeMap: Map<string, WorkflowCanvasNode>,
  removedIds: ReadonlySet<string>,
): string | undefined => {
  let parentId = node.parentId
  while (parentId) {
    if (!removedIds.has(parentId)) {
      return parentId
    }
    parentId = nodeMap.get(parentId)?.parentId
  }
  return undefined
}

export const reparentAfterRemovedAncestors = (
  node: WorkflowCanvasNode,
  nodeMap: Map<string, WorkflowCanvasNode>,
  removedIds: ReadonlySet<string>,
): WorkflowCanvasNode => {
  const absolutePosition = absoluteNodePosition(node, nodeMap)
  const nextParentId = nearestPreservedParentId(node, nodeMap, removedIds)
  if (!nextParentId) {
    return {
      ...clearParentFrame(node),
      position: absolutePosition,
    }
  }
  const parent = nodeMap.get(nextParentId)
  if (!parent) {
    return {
      ...clearParentFrame(node),
      position: absolutePosition,
    }
  }
  const parentPosition = absoluteNodePosition(parent, nodeMap)
  return {
    ...node,
    parentId: nextParentId,
    extent: 'parent',
    position: {
      x: absolutePosition.x - parentPosition.x,
      y: absolutePosition.y - parentPosition.y,
    },
  }
}

const isDescendantOfWorkflowNode = (
  nodeId: string,
  ancestorNodeId: string,
  nodeMap: Map<string, WorkflowCanvasNode>,
): boolean => {
  let parentId = nodeMap.get(nodeId)?.parentId
  while (parentId) {
    if (parentId === ancestorNodeId) {
      return true
    }
    parentId = nodeMap.get(parentId)?.parentId
  }
  return false
}

export const canAttachNodeToGroup = (
  node: WorkflowCanvasNode,
  groupNode: WorkflowCanvasNode,
  nodeMap: Map<string, WorkflowCanvasNode>,
): boolean => {
  if (!isWorkflowGroupNode(groupNode)) {
    return false
  }
  if (node.id === groupNode.id || node.parentId === groupNode.id) {
    return false
  }
  if (isWorkflowGroupNode(node)) {
    return false
  }
  return !isDescendantOfWorkflowNode(groupNode.id, node.id, nodeMap)
}

export const applyFrameToNode = (
  node: WorkflowCanvasNode,
  frame: WorkflowNodeFramePatch,
): WorkflowCanvasNode => {
  const nextNode: WorkflowCanvasNode = {
    ...node,
    position: frame.position ?? node.position,
    ...(frame.width !== undefined ? { width: frame.width } : {}),
    ...(frame.height !== undefined ? { height: frame.height } : {}),
  }
  if (!('parentId' in frame)) {
    return nextNode
  }
  if (frame.parentId) {
    if (isWorkflowGroupNode(node)) {
      return nextNode
    }
    return {
      ...nextNode,
      extent: 'parent',
      parentId: frame.parentId,
    }
  }
  return clearParentFrame(nextNode)
}

export const nodeFrameChanged = (left: WorkflowCanvasNode | undefined, right: WorkflowCanvasNode): boolean =>
  !left ||
  left.position.x !== right.position.x ||
  left.position.y !== right.position.y ||
  left.parentId !== right.parentId ||
  left.extent !== right.extent ||
  left.width !== right.width ||
  left.height !== right.height

export const changedFrameNodes = (
  currentNodes: readonly WorkflowCanvasNode[],
  nextNodes: readonly WorkflowCanvasNode[],
): WorkflowCanvasNode[] => {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]))
  return nextNodes.filter((node) => nodeFrameChanged(currentById.get(node.id), node))
}

import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { Node } from '@xyflow/react'

import { MEDIA_GENERATION_NODE_FRAME } from './canvas-node-types'

export interface CanvasNodeSize {
  height: number
  width: number
}

export interface CanvasNodeBounds extends CanvasNodeSize {
  bottom: number
  left: number
  right: number
  top: number
}

type NodeLike = Pick<WorkflowCanvasNode, 'height' | 'position' | 'type' | 'width'> & {
  measured?: Node['measured'] | undefined
}

type PositionedNodeLike = Pick<WorkflowCanvasNode, 'id' | 'parentId' | 'position'>

export const TEXT_NODE_FRAME: CanvasNodeSize = {
  height: 128,
  width: 224,
}

export const mediaGenerationNodeFrame: CanvasNodeSize = {
  height: MEDIA_GENERATION_NODE_FRAME.height,
  width: MEDIA_GENERATION_NODE_FRAME.width,
}

export const WORKFLOW_GROUP_PADDING_X = 28
export const WORKFLOW_GROUP_PADDING_TOP = 56
export const WORKFLOW_GROUP_PADDING_BOTTOM = 28
export const WORKFLOW_GROUP_MIN_CONTENT_WIDTH = 260
export const WORKFLOW_GROUP_MIN_CONTENT_HEIGHT = 160

export function getWorkflowNodeSize(node: NodeLike): CanvasNodeSize {
  if (typeof node.measured?.width === 'number' && typeof node.measured.height === 'number') {
    return {
      height: node.measured.height,
      width: node.measured.width,
    }
  }
  if (typeof node.width === 'number' && typeof node.height === 'number') {
    return {
      height: node.height,
      width: node.width,
    }
  }
  if (node.type === 'text') {
    return {
      height: Math.max(node.height ?? TEXT_NODE_FRAME.height, TEXT_NODE_FRAME.height),
      width: Math.max(node.width ?? TEXT_NODE_FRAME.width, TEXT_NODE_FRAME.width),
    }
  }
  if (node.type === 'flow_group' || node.type === 'node_group') {
    return {
      height: node.height ?? 300,
      width: node.width ?? 520,
    }
  }
  return {
    height: Math.max(node.height ?? mediaGenerationNodeFrame.height, mediaGenerationNodeFrame.height),
    width: Math.max(node.width ?? mediaGenerationNodeFrame.width, mediaGenerationNodeFrame.width),
  }
}

export function getWorkflowNodeBounds(node: NodeLike, absolutePosition: { x: number; y: number }): CanvasNodeBounds {
  const size = getWorkflowNodeSize(node)
  return {
    ...size,
    bottom: absolutePosition.y + size.height,
    left: absolutePosition.x,
    right: absolutePosition.x + size.width,
    top: absolutePosition.y,
  }
}

export function getAbsoluteWorkflowNodePosition(
  node: PositionedNodeLike,
  nodeMap: ReadonlyMap<string, PositionedNodeLike>,
): { x: number; y: number } {
  let current: PositionedNodeLike | undefined = node
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

export function getWorkflowNodeAbsoluteBounds<TNode extends NodeLike & PositionedNodeLike>(
  node: TNode,
  nodeMap: ReadonlyMap<string, PositionedNodeLike>,
): CanvasNodeBounds {
  return getWorkflowNodeBounds(node, getAbsoluteWorkflowNodePosition(node, nodeMap))
}

export function getWorkflowNodesBoundsUnion<TNode extends NodeLike & PositionedNodeLike>(
  nodes: readonly TNode[],
  nodeMap: ReadonlyMap<string, PositionedNodeLike>,
): CanvasNodeBounds | undefined {
  if (nodes.length === 0) {
    return undefined
  }
  const positioned = nodes.map((node) => getWorkflowNodeAbsoluteBounds(node, nodeMap))
  const left = Math.min(...positioned.map((item) => item.left))
  const top = Math.min(...positioned.map((item) => item.top))
  const right = Math.max(...positioned.map((item) => item.right))
  const bottom = Math.max(...positioned.map((item) => item.bottom))
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  }
}

export function getLogicalGroupFrameFromChildren(
  childBounds: CanvasNodeBounds,
): { absolutePosition: { x: number; y: number }; height: number; width: number } {
  return {
    absolutePosition: {
      x: childBounds.left - WORKFLOW_GROUP_PADDING_X,
      y: childBounds.top - WORKFLOW_GROUP_PADDING_TOP,
    },
    height: Math.max(
      WORKFLOW_GROUP_MIN_CONTENT_HEIGHT,
      childBounds.bottom - childBounds.top + WORKFLOW_GROUP_PADDING_TOP + WORKFLOW_GROUP_PADDING_BOTTOM,
    ),
    width: Math.max(
      WORKFLOW_GROUP_MIN_CONTENT_WIDTH,
      childBounds.right - childBounds.left + WORKFLOW_GROUP_PADDING_X * 2,
    ),
  }
}

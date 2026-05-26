import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { NodeMediaSlotItem } from '@mina/contracts/modules/media'

import { isMediaGenerationNode } from '../domain/canvas-node-types'
import {
  slotItemsForNodeType,
} from '../domain/media-slot-policy'

export const mediaSlotItems = (node: WorkflowCanvasNode): NodeMediaSlotItem[] =>
  isMediaGenerationNode(node)
    ? slotItemsForNodeType(node.data.nodeType, node.data.mediaSlots)
    : []

export const normalizeSlotOrder = (items: readonly NodeMediaSlotItem[]): NodeMediaSlotItem[] =>
  [...items]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((item, index) => ({ ...item, order: index }))

export const assignSlotOrder = (items: readonly NodeMediaSlotItem[]): NodeMediaSlotItem[] =>
  items.map((item, index) => ({ ...item, order: index }))

export const removeEdgeSlotItem = (
  node: WorkflowCanvasNode,
  edge: WorkflowCanvasEdge,
): WorkflowCanvasNode => {
  if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
    return node
  }
  if (!edge.data.connection) {
    return node
  }
  const slot = edge.data.connection.targetSlot
  const targetSlotItemId = edge.data.connection.targetSlotItemId
  const current = node.data.mediaSlots?.[slot] ?? []
  return {
    ...node,
    data: {
      ...node.data,
      mediaSlots: {
        ...(node.data.mediaSlots ?? {}),
        [slot]: normalizeSlotOrder(current.filter((item) => item.id !== targetSlotItemId)),
      },
    },
  }
}

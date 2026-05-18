import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem, NodeOutputSelector } from '@mina/contracts/modules/media'

export const mediaSlotItems = (node: WorkflowCanvasNode): NodeMediaSlotItem[] =>
  node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'
    ? Object.values(node.data.mediaSlots ?? {}).flat()
    : []

export const normalizeSlotOrder = (items: readonly NodeMediaSlotItem[]): NodeMediaSlotItem[] =>
  [...items]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((item, index) => ({ ...item, order: index }))

export const defaultSlotForTarget = (target: WorkflowCanvasNode): MediaSlotName =>
  target.data.nodeType === 'video_generation' ? 'firstFrame' : 'inputImages'

export const defaultSelectorForSlot = (slot: MediaSlotName): NodeOutputSelector => {
  if (slot === 'referenceVideos') {
    return { resourceKind: 'video', role: 'generated_video', index: 0 }
  }
  if (slot === 'lastFrame') {
    return { resourceKind: 'image', role: 'last_frame', index: 0 }
  }
  if (slot === 'firstFrame') {
    return { resourceKind: 'image', role: 'first_frame', index: 0 }
  }
  return { resourceKind: 'image', role: 'generated_image', index: 0 }
}

export const removeEdgeSlotItem = (
  node: WorkflowCanvasNode,
  edge: WorkflowCanvasEdge,
): WorkflowCanvasNode => {
  if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
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

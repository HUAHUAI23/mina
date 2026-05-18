import type {
  MediaSlotName,
  NodeMediaSlotItem,
  NodeOutputSelector,
} from '@mina/contracts/modules/media'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { ResourceRef } from '@mina/contracts/modules/tasks'

export const SINGLE_MEDIA_SLOTS = new Set<MediaSlotName>(['firstFrame', 'lastFrame'])

export const sortedSlotItems = (items: readonly NodeMediaSlotItem[]): NodeMediaSlotItem[] =>
  [...items].sort((left, right) => {
    const orderDiff = left.order - right.order
    if (orderDiff !== 0) {
      return orderDiff
    }
    return left.id.localeCompare(right.id)
  })

export const mediaSlotItemsForNode = (
  node: WorkflowCanvasNode,
  _edges: readonly WorkflowCanvasEdge[],
): NodeMediaSlotItem[] => {
  return node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'
    ? Object.values(node.data.mediaSlots ?? {}).flat()
    : []
}

export const nodeOutputDependenciesForNode = (
  node: WorkflowCanvasNode,
  edges: readonly WorkflowCanvasEdge[],
): string[] =>
  mediaSlotItemsForNode(node, edges)
    .map((item) => item.source)
    .filter((source): source is Extract<NodeMediaSlotItem['source'], { type: 'node_output' }> => source.type === 'node_output')
    .map((source) => source.nodeId)

export const selectorFromResourceRef = (resource: ResourceRef): NodeOutputSelector | undefined =>
  resource.role && resource.index !== undefined
    ? {
        resourceKind: resource.kind,
        role: resource.role,
        index: resource.index,
      }
    : undefined

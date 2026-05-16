import type {
  MediaSlotName,
  NodeMediaSlotItem,
  NodeOutputSelector,
} from '@mina/contracts/modules/media'
import type { MediaSlotConnection, WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
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

const slotItemIdFromEdge = (edge: WorkflowCanvasEdge): string => {
  if (edge.data.connection.kind === 'media_link') {
    return edge.data.connection.targetSlotItemId
  }
  return `${edge.id}:slot-item`
}

const nodeSlotItemFromLegacyEdge = (edge: WorkflowCanvasEdge, connection: MediaSlotConnection): NodeMediaSlotItem | undefined => {
  if (connection.targetSlot === 'prompt') {
    return undefined
  }
  if (connection.sourceSelector.mode === 'empty') {
    return undefined
  }
  if (connection.sourceSelector.mode === 'asset') {
    const resource = connection.sourceSelector.resource
    return {
      id: slotItemIdFromEdge(edge),
      slot: connection.targetSlot,
      order: 0,
      required: connection.required,
      source: {
        type: 'external_url',
        kind: resource.kind,
        url: resource.url,
        ...(resource.metadata ? { metadata: resource.metadata } : {}),
      },
    }
  }
  if (connection.sourceSelector.mode === 'run_output') {
    return {
      id: slotItemIdFromEdge(edge),
      slot: connection.targetSlot,
      order: 0,
      required: connection.required,
      source: {
        type: 'node_output',
        nodeId: edge.source,
        resolve: 'run_output',
        selector: {
          resourceKind: connection.sourceSelector.resourceKind,
          role: connection.sourceSelector.role,
          index: connection.sourceSelector.index,
        },
      },
    }
  }
  return {
    id: slotItemIdFromEdge(edge),
    slot: connection.targetSlot,
    order: 0,
    required: connection.required,
    source: {
      type: 'node_output',
      nodeId: edge.source,
      resolve: 'current_media',
    },
  }
}

export const mediaSlotItemsForNode = (
  node: WorkflowCanvasNode,
  edges: readonly WorkflowCanvasEdge[],
): NodeMediaSlotItem[] => {
  const fromNodeData =
    node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'
      ? Object.values(node.data.mediaSlots ?? {}).flat()
      : []
  const legacyItems = edges
    .filter((edge) => edge.target === node.id && edge.data.connection.kind === 'media_slot')
    .map((edge) => nodeSlotItemFromLegacyEdge(edge, edge.data.connection as MediaSlotConnection))
    .filter((item): item is NodeMediaSlotItem => item !== undefined)

  return [...fromNodeData, ...legacyItems]
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

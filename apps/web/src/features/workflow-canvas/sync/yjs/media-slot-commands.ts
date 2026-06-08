import type { WorkflowCanvasEdge, WorkflowCanvasNode, WorkflowNodeType } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem, NodeMediaSlots } from '@mina/contracts/modules/media'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'
import {
  defaultSelectorForMediaSlot,
} from '@mina/contracts/modules/canvas/group-conversion'

import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import {
  coerceMediaSlotForNodeType,
  isMediaSlotAllowedForNodeType,
  mediaSlotsForNodeType,
  normalizeMediaSlotsForNodeType,
} from '../../domain/media-slot-policy'
import { mediaSlotFromHandleId } from '../../domain/media-slot-handles'
import { shareFlowGroupScope } from '../../utils/flow-scope'
import {
  assignSlotOrder,
  normalizeSlotOrder,
  removeEdgeSlotItem,
} from '../../utils/media-slots'
import { updateNodesWithCompatibleMediaModels } from '../../store/model-compatibility-actions'
import { taskWithCompatibleModel } from '../../forms/model-compatibility'
import { resolveClientModel } from '../../forms/registry/client-model-registry'
import { createStoreId } from '../../store/store-helpers'
import type { AddConnectedMediaGenerationNodeInput, MediaConnectionInput } from '../../store/store-types'

export const mediaCapabilitiesForTask = (task: TaskDraftConfig | undefined) =>
  task ? resolveClientModel({ kind: task.kind, model: task.model, provider: task.provider })?.mediaCapabilities : undefined

export const createMediaEdge = (
  input: {
    sourceHandle?: string | undefined
    sourceId: string
    targetHandle?: string | undefined
    targetId: string
  },
  targetSlotItemId: string,
  targetSlot: MediaSlotName,
): WorkflowCanvasEdge => ({
  id: createStoreId('edge'),
  type: 'media',
  source: input.sourceId,
  target: input.targetId,
  ...(input.sourceHandle ? { sourceHandle: input.sourceHandle } : {}),
  ...(input.targetHandle ? { targetHandle: input.targetHandle } : {}),
  data: {
    connection: {
      kind: 'media_link',
      targetSlot,
      targetSlotItemId,
    },
  },
})

export const resolveMediaConnectionPatch = (
  nodes: readonly WorkflowCanvasNode[],
  input: MediaConnectionInput,
): { edge: WorkflowCanvasEdge; node: WorkflowCanvasNode } | undefined => {
  const source = nodes.find((node) => node.id === input.sourceId)
  const target = nodes.find((node) => node.id === input.targetId)
  if (!source || !target || source.id === target.id) {
    return undefined
  }
  if (!isMediaGenerationNode(source) || !isMediaGenerationNode(target)) {
    return undefined
  }

  const requestedSlot = mediaSlotFromHandleId(target.data.nodeType, input.targetHandle)
  const capabilities = mediaCapabilitiesForTask(target.data.config.task)
  const slot = coerceMediaSlotForNodeType(target.data.nodeType, requestedSlot, capabilities)
  if (!slot) {
    return undefined
  }

  const targetSlotItemId = createStoreId('slot_item')
  const slotDescriptor = mediaSlotsForNodeType(target.data.nodeType, capabilities).find((descriptor) => descriptor.slot === slot)
  const existingItems = target.data.mediaSlots?.[slot] ?? []
  if (slotDescriptor?.maxItems !== undefined && existingItems.length >= slotDescriptor.maxItems) {
    return undefined
  }
  const useRunOutput = shareFlowGroupScope(source, target, nodes)
  const item: NodeMediaSlotItem = {
    id: targetSlotItemId,
    order: existingItems.length,
    required: true,
    slot,
    source: useRunOutput
      ? {
          type: 'node_output',
          nodeId: source.id,
          resolve: 'run_output',
          selector: defaultSelectorForMediaSlot(slot),
        }
      : {
          type: 'node_output',
          nodeId: source.id,
          resolve: 'current_media',
        },
  }
  const node: WorkflowCanvasNode = structuredClone(target)
  if (!isMediaGenerationNode(node)) {
    return undefined
  }
  node.data.mediaSlots = {
    ...(node.data.mediaSlots ?? {}),
    [slot]: normalizeSlotOrder([...existingItems, item]),
  }
  if (node.data.config.task) {
    node.data.config.task = taskWithCompatibleModel(node.data.config.task, node.data.mediaSlots)
  }
  return {
    edge: createMediaEdge(input, targetSlotItemId, slot),
    node,
  }
}

export const initializeMediaGenerationNodeData = (
  node: WorkflowCanvasNode,
  input: {
    mediaSlots?: NodeMediaSlots | undefined
    nodeType: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>
    task: TaskDraftConfig
  },
): void => {
  if (!isMediaGenerationNode(node)) {
    return
  }
  node.data.config.task = input.task
  node.data.mediaSlots = normalizeMediaSlotsForNodeType(input.nodeType, input.mediaSlots, mediaCapabilitiesForTask(input.task))
  node.data.config.task = taskWithCompatibleModel(node.data.config.task, node.data.mediaSlots)
}

export const resolveConnectedMediaGenerationPatch = (
  nodes: readonly WorkflowCanvasNode[],
  node: WorkflowCanvasNode,
  input: AddConnectedMediaGenerationNodeInput,
): { edge: WorkflowCanvasEdge; node: WorkflowCanvasNode } | undefined => {
  const source = nodes.find((candidate) => candidate.id === input.sourceId)
  if (!isMediaGenerationNode(source) || !isMediaGenerationNode(node)) {
    return undefined
  }
  node.data.config.task = input.task
  node.data.mediaSlots = normalizeMediaSlotsForNodeType(input.nodeType, undefined, mediaCapabilitiesForTask(input.task))

  const slot = coerceMediaSlotForNodeType(input.nodeType, undefined, mediaCapabilitiesForTask(input.task))
  if (!slot) {
    return undefined
  }
  const slotItemId = createStoreId('slot_item')
  const item: NodeMediaSlotItem = {
    id: slotItemId,
    order: 0,
    required: true,
    slot,
    source: shareFlowGroupScope(source, node, [...nodes, node])
      ? {
          type: 'node_output',
          nodeId: source.id,
          resolve: 'run_output',
          selector: defaultSelectorForMediaSlot(slot),
        }
      : {
          type: 'node_output',
          nodeId: source.id,
          resolve: 'current_media',
        },
  }
  node.data.mediaSlots = {
    ...node.data.mediaSlots,
    [slot]: [item],
  }
  node.data.config.task = taskWithCompatibleModel(node.data.config.task, node.data.mediaSlots)
  return {
    edge: createMediaEdge(
      {
        ...(input.sourceHandle ? { sourceHandle: input.sourceHandle } : {}),
        sourceId: source.id,
        targetId: node.id,
      },
      slotItemId,
      slot,
    ),
    node,
  }
}

export const resolveNodesAfterRemovedEdges = (
  nodes: readonly WorkflowCanvasNode[],
  removedEdges: readonly WorkflowCanvasEdge[],
): WorkflowCanvasNode[] =>
  updateNodesWithCompatibleMediaModels(removedEdges.reduce(
    (items, edge) => items.map((node) => (node.id === edge.target ? removeEdgeSlotItem(node, edge) : node)),
    [...nodes],
  ))

export const addSlotItemToNode = (node: WorkflowCanvasNode, item: NodeMediaSlotItem): WorkflowCanvasNode | undefined => {
  if (!isMediaGenerationNode(node)) {
    return undefined
  }
  const capabilities = mediaCapabilitiesForTask(node.data.config.task)
  if (!isMediaSlotAllowedForNodeType(node.data.nodeType, item.slot, capabilities)) {
    return undefined
  }
  const slotDescriptor = mediaSlotsForNodeType(node.data.nodeType, capabilities).find((descriptor) => descriptor.slot === item.slot)
  const items = normalizeSlotOrder(node.data.mediaSlots?.[item.slot] ?? [])
  if (slotDescriptor?.maxItems !== undefined && items.length >= slotDescriptor.maxItems) {
    return undefined
  }
  const insertIndex = Math.min(Math.max(item.order, 0), items.length)
  node.data.mediaSlots = {
    ...(node.data.mediaSlots ?? {}),
    [item.slot]: assignSlotOrder([...items.slice(0, insertIndex), item, ...items.slice(insertIndex)]),
  }
  if (node.data.config.task) {
    node.data.config.task = taskWithCompatibleModel(node.data.config.task, node.data.mediaSlots)
  }
  return node
}

export const removeSlotItemFromNode = (
  node: WorkflowCanvasNode,
  slot: MediaSlotName,
  slotItemId: string,
): WorkflowCanvasNode | undefined => {
  if (!isMediaGenerationNode(node)) {
    return undefined
  }
  node.data.mediaSlots = {
    ...(node.data.mediaSlots ?? {}),
    [slot]: normalizeSlotOrder((node.data.mediaSlots?.[slot] ?? []).filter((item) => item.id !== slotItemId)),
  }
  if (node.data.config.task) {
    node.data.config.task = taskWithCompatibleModel(node.data.config.task, node.data.mediaSlots)
  }
  return node
}

export const reorderSlotItemInNode = (
  node: WorkflowCanvasNode,
  slot: MediaSlotName,
  slotItemId: string,
  direction: -1 | 1,
): WorkflowCanvasNode | undefined => {
  if (!isMediaGenerationNode(node)) {
    return undefined
  }
  const items = normalizeSlotOrder(node.data.mediaSlots?.[slot] ?? [])
  const index = items.findIndex((item) => item.id === slotItemId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
    return undefined
  }
  const current = items[index]
  const next = items[nextIndex]
  if (!current || !next) {
    return undefined
  }
  items[index] = next
  items[nextIndex] = current
  node.data.mediaSlots = {
    ...(node.data.mediaSlots ?? {}),
    [slot]: normalizeSlotOrder(items),
  }
  return node
}

export const reorderSlotItemsInNode = (
  node: WorkflowCanvasNode,
  slot: MediaSlotName,
  orderedIds: readonly string[],
): WorkflowCanvasNode | undefined => {
  if (!isMediaGenerationNode(node)) {
    return undefined
  }
  const currentItems = normalizeSlotOrder(node.data.mediaSlots?.[slot] ?? [])
  const itemsById = new Map(currentItems.map((item) => [item.id, item]))
  const orderedItems = orderedIds
    .map((id) => itemsById.get(id))
    .filter((item): item is NodeMediaSlotItem => Boolean(item))
  const orderedSet = new Set(orderedIds)
  const remainingItems = currentItems.filter((item) => !orderedSet.has(item.id))
  node.data.mediaSlots = {
    ...(node.data.mediaSlots ?? {}),
    [slot]: assignSlotOrder([...orderedItems, ...remainingItems]),
  }
  return node
}

export const replaceSlotItemWithMediaObject = (
  node: WorkflowCanvasNode,
  slot: MediaSlotName,
  slotItemId: string,
  mediaObjectId: string,
): WorkflowCanvasNode | undefined => {
  if (!isMediaGenerationNode(node)) {
    return undefined
  }
  const items = node.data.mediaSlots?.[slot] ?? []
  node.data.mediaSlots = {
    ...(node.data.mediaSlots ?? {}),
    [slot]: normalizeSlotOrder(
      items.map((item) =>
        item.id === slotItemId
          ? {
              ...item,
              source: { type: 'media_object', mediaObjectId },
            }
          : item,
      ),
    ),
  }
  if (node.data.config.task) {
    node.data.config.task = taskWithCompatibleModel(node.data.config.task, node.data.mediaSlots)
  }
  return node
}

export const setMediaViewOnNode = (
  node: WorkflowCanvasNode,
  mediaView: NodeMediaViewState | undefined,
): WorkflowCanvasNode | undefined => {
  if (!isMediaGenerationNode(node)) {
    return undefined
  }
  if (mediaView) {
    node.data.mediaView = mediaView
  } else {
    delete node.data.mediaView
  }
  return node
}

export const updateSlotItemInNode = (
  node: WorkflowCanvasNode,
  item: NodeMediaSlotItem,
): WorkflowCanvasNode | undefined => {
  if (!isMediaGenerationNode(node)) {
    return undefined
  }
  const capabilities = mediaCapabilitiesForTask(node.data.config.task)
  if (!isMediaSlotAllowedForNodeType(node.data.nodeType, item.slot, capabilities)) {
    return undefined
  }
  const items = node.data.mediaSlots?.[item.slot] ?? []
  node.data.mediaSlots = {
    ...(node.data.mediaSlots ?? {}),
    [item.slot]: normalizeSlotOrder(items.map((candidate) => (candidate.id === item.id ? item : candidate))),
  }
  return node
}

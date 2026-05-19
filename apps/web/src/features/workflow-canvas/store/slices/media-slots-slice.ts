import { produce } from 'immer'
import type { NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import { isMediaSlotAllowedForNodeType } from '../../domain/media-slot-policy'
import {
  assignSlotOrder,
  normalizeSlotOrder,
} from '../../utils/media-slots'
import { commitDraftChanged } from '../store-helpers'
import type {
  CanvasStore,
  CanvasMediaSlotActions,
  CanvasSliceCreator,
} from '../store-types'

export const createMediaSlotsSlice: CanvasSliceCreator<
  CanvasMediaSlotActions
> = (set) => ({
  addSlotItem: (nodeId, item) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((candidate: WorkflowCanvasNode) => candidate.id === nodeId)
        if (
          !isMediaGenerationNode(node) ||
          !isMediaSlotAllowedForNodeType(node.data.nodeType, item.slot)
        ) {
          return
        }
        const items = node.data.mediaSlots?.[item.slot] ?? []
        node.data.mediaSlots = {
          ...(node.data.mediaSlots ?? {}),
          [item.slot]: normalizeSlotOrder([...items, item]),
        }
        commitDraftChanged(state)
      }),
    ),
  removeSlotItem: (nodeId, slot, slotItemId) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item: WorkflowCanvasNode) => item.id === nodeId)
        if (!isMediaGenerationNode(node)) {
          return
        }
        node.data.mediaSlots = {
          ...(node.data.mediaSlots ?? {}),
          [slot]: normalizeSlotOrder(
            (node.data.mediaSlots?.[slot] ?? []).filter(
              (item: NodeMediaSlotItem) => item.id !== slotItemId,
            ),
          ),
        }
        state.edges = state.edges.filter(
          (edge: WorkflowCanvasEdge) => edge.data.connection.targetSlotItemId !== slotItemId,
        )
        commitDraftChanged(state)
      }),
    ),
  reorderSlotItem: (nodeId, slot, slotItemId, direction) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item: WorkflowCanvasNode) => item.id === nodeId)
        if (!isMediaGenerationNode(node)) {
          return
        }
        const items = normalizeSlotOrder(node.data.mediaSlots?.[slot] ?? [])
        const index = items.findIndex((item) => item.id === slotItemId)
        const nextIndex = index + direction
        if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
          return
        }
        const current = items[index]
        const next = items[nextIndex]
        if (!current || !next) {
          return
        }
        items[index] = next
        items[nextIndex] = current
        node.data.mediaSlots = {
          ...(node.data.mediaSlots ?? {}),
          [slot]: normalizeSlotOrder(items),
        }
        commitDraftChanged(state)
      }),
    ),
  reorderSlotItems: (nodeId, slot, orderedIds) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item: WorkflowCanvasNode) => item.id === nodeId)
        if (!isMediaGenerationNode(node)) {
          return
        }
        const currentItems = normalizeSlotOrder(node.data.mediaSlots?.[slot] ?? [])
        const itemsById = new Map(currentItems.map((item) => [item.id, item]))
        const orderedItems = orderedIds
          .map((id) => itemsById.get(id))
          .filter((item): item is NodeMediaSlotItem => Boolean(item))
        const orderedSet = new Set(orderedIds)
        const remainingItems = currentItems.filter(
          (item) => !orderedSet.has(item.id),
        )
        node.data.mediaSlots = {
          ...(node.data.mediaSlots ?? {}),
          [slot]: assignSlotOrder([...orderedItems, ...remainingItems]),
        }
        commitDraftChanged(state)
      }),
    ),
  replaceSlotItemMediaObject: (nodeId, slot, slotItemId, mediaObjectId) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item: WorkflowCanvasNode) => item.id === nodeId)
        if (!isMediaGenerationNode(node)) {
          return
        }
        const items = node.data.mediaSlots?.[slot] ?? []
        node.data.mediaSlots = {
          ...(node.data.mediaSlots ?? {}),
          [slot]: normalizeSlotOrder(
            items.map((item: NodeMediaSlotItem) =>
              item.id === slotItemId
                ? {
                    ...item,
                    source: { type: 'media_object', mediaObjectId },
                  }
                : item,
            ),
          ),
        }
        commitDraftChanged(state)
      }),
    ),
  updateSlotItem: (nodeId, item) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((candidate: WorkflowCanvasNode) => candidate.id === nodeId)
        if (
          !isMediaGenerationNode(node) ||
          !isMediaSlotAllowedForNodeType(node.data.nodeType, item.slot)
        ) {
          return
        }
        const items = node.data.mediaSlots?.[item.slot] ?? []
        node.data.mediaSlots = {
          ...(node.data.mediaSlots ?? {}),
          [item.slot]: normalizeSlotOrder(
            items.map((candidate: NodeMediaSlotItem) =>
              candidate.id === item.id ? item : candidate,
            ),
          ),
        }
        commitDraftChanged(state)
      }),
    ),
})

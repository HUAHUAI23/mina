import { produce } from 'immer'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'

import { createWorkflowCanvasNode, isMediaGenerationNode } from '../../domain/canvas-node-types'
import {
  coerceMediaSlotForNodeType,
  defaultSelectorForMediaSlot,
} from '../../domain/media-slot-policy'
import { mediaSlotFromHandleId } from '../../domain/media-slot-handles'
import { shareFlowGroupScope } from '../../utils/flow-scope'
import {
  normalizeSlotOrder,
  removeEdgeSlotItem,
} from '../../utils/media-slots'
import { commitDocumentTransaction, createStoreId } from '../store-helpers'
import type {
  CanvasStore,
  CanvasGraphActions,
  CanvasGraphState,
  CanvasNodeFramePatch,
  CanvasSliceCreator,
} from '../store-types'

export const initialGraphState: CanvasGraphState = {
  edges: [],
  name: '',
  nodeIndexById: {},
  nodes: [],
  workflowId: '',
}

const createMediaEdge = (
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

const applyNodeFramePatch = (
  node: WorkflowCanvasNode,
  input: {
    height?: number | undefined
    parentId?: string | undefined
    position?: { x: number; y: number } | undefined
    width?: number | undefined
  },
): boolean => {
  let changed = false
  if (
    input.position &&
    (node.position.x !== input.position.x || node.position.y !== input.position.y)
  ) {
    node.position = input.position
    changed = true
  }
  if (input.parentId !== undefined && node.parentId !== input.parentId) {
    node.parentId = input.parentId
    changed = true
  }
  if (input.width !== undefined && node.width !== input.width) {
    node.width = input.width
    changed = true
  }
  if (input.height !== undefined && node.height !== input.height) {
    node.height = input.height
    changed = true
  }
  return changed
}

export const createGraphSlice: CanvasSliceCreator<
  CanvasGraphState & CanvasGraphActions
> = (_set, _get) => ({
  ...initialGraphState,
  addMediaConnection: (input) =>
    _set(
      produce<CanvasStore>((state) => {
        const source = state.nodes.find((node: WorkflowCanvasNode) => node.id === input.sourceId)
        const target = state.nodes.find((node: WorkflowCanvasNode) => node.id === input.targetId)
        if (!source || !target || !isMediaGenerationNode(target)) {
          return
        }

        const requestedSlot = mediaSlotFromHandleId(target.data.nodeType, input.targetHandle)
        const slot = coerceMediaSlotForNodeType(target.data.nodeType, requestedSlot)
        if (!slot) {
          return
        }

        const targetSlotItemId = createStoreId('slot_item')
        const existingItems = target.data.mediaSlots?.[slot] ?? []
        const useRunOutput = shareFlowGroupScope(source, target, state.nodes)
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

        target.data.mediaSlots = {
          ...(target.data.mediaSlots ?? {}),
          [slot]: normalizeSlotOrder([...existingItems, item]),
        }
        const edge = createMediaEdge(input, targetSlotItemId, slot)
        state.edges.push(edge)
        commitDocumentTransaction(state, {
          edge,
          node: target,
          type: 'connect_media_slot',
        })
      }),
    ),
  addNode: (type) =>
    _set(
      produce<CanvasStore>((state) => {
        const node = createWorkflowCanvasNode(type, state.nodes.length)
        state.nodes.push(node)
        commitDocumentTransaction(state, { node, type: 'upsert_node' })
      }),
    ),
  commitNodeFrames: (frames) =>
    _set(
      produce<CanvasStore>((state) => {
        let changed = false
        const changes: CanvasNodeFramePatch[] = []
        for (const frame of frames) {
          const node = state.nodes.find((item: WorkflowCanvasNode) => item.id === frame.nodeId)
          if (!node) {
            continue
          }
          if (applyNodeFramePatch(node, frame)) {
            changed = true
            changes.push(frame)
          }
        }
        if (changed) {
          commitDocumentTransaction(state, { changes, type: 'move_nodes' })
        }
      }),
    ),
  removeGraphEdges: (edgeIds) =>
    _set(
      produce<CanvasStore>((state) => {
        const removedIds = new Set(edgeIds)
        if (removedIds.size === 0) {
          return
        }
        const removedEdges = state.edges.filter((edge: WorkflowCanvasEdge) => removedIds.has(edge.id))
        if (removedEdges.length === 0) {
          return
        }

        state.edges = state.edges.filter((edge: WorkflowCanvasEdge) => !removedIds.has(edge.id))
        state.nodes = removedEdges.reduce(
          (nodes: WorkflowCanvasNode[], edge: WorkflowCanvasEdge) =>
            nodes.map((node: WorkflowCanvasNode) =>
              node.id === edge.target ? removeEdgeSlotItem(node, edge) : node,
            ),
          state.nodes,
        )
        commitDocumentTransaction(state, {
          edges: state.edges,
          nodes: state.nodes,
          type: 'replace_snapshot',
        })
      }),
    ),
  removeGraphNodes: (nodeIds) =>
    _set(
      produce<CanvasStore>((state) => {
        const removedIds = new Set(nodeIds)
        if (removedIds.size === 0) {
          return
        }
        const removedEdges = state.edges.filter(
          (edge: WorkflowCanvasEdge) => removedIds.has(edge.source) || removedIds.has(edge.target),
        )
        const nextNodes = state.nodes.filter((node: WorkflowCanvasNode) => !removedIds.has(node.id))
        if (nextNodes.length === state.nodes.length && removedEdges.length === 0) {
          return
        }

        state.nodes = removedEdges.reduce(
          (nodes: WorkflowCanvasNode[], edge: WorkflowCanvasEdge) =>
            nodes.map((node: WorkflowCanvasNode) =>
              node.id === edge.target ? removeEdgeSlotItem(node, edge) : node,
            ),
          nextNodes,
        )
        state.edges = state.edges.filter(
          (edge: WorkflowCanvasEdge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
        )
        commitDocumentTransaction(state, {
          edges: state.edges,
          nodes: state.nodes,
          type: 'replace_snapshot',
        })
      }),
    ),
  setNodeFrame: (input) =>
    _set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item: WorkflowCanvasNode) => item.id === input.nodeId)
        if (!node) {
          return
        }

        if (applyNodeFramePatch(node, input)) {
          commitDocumentTransaction(state, {
            changes: [input],
            type: 'move_nodes',
          })
        }
      }),
    ),
})

import type { WorkflowCanvasEdge, WorkflowCanvasNode, WorkflowNodeType } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

import { createWorkflowCanvasNode, isMediaGenerationNode } from '../../domain/canvas-node-types'
import {
  coerceMediaSlotForNodeType,
  defaultSelectorForMediaSlot,
  isMediaSlotAllowedForNodeType,
} from '../../domain/media-slot-policy'
import { mediaSlotFromHandleId } from '../../domain/media-slot-handles'
import { shareFlowGroupScope } from '../../utils/flow-scope'
import {
  assignSlotOrder,
  normalizeSlotOrder,
  removeEdgeSlotItem,
} from '../../utils/media-slots'
import { createStoreId } from '../../store/store-helpers'
import type { CanvasNodeFramePatch, MediaConnectionInput } from '../../store/store-types'
import { createWorkflowYDoc, type WorkflowYDocHandles } from './yjs-document'
import { exportWorkflowYjsSnapshot } from './yjs-snapshot'
import { getWorkflowYjsRuntimeForWorkflow } from './workflow-yjs-store'
import { validateWorkflowCanvasGraph } from '../../domain/canvas-graph-validation'

export interface WorkflowYjsCommandContext {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
  workflowId: string
}

const withYDoc = (
  context: WorkflowYjsCommandContext,
  mutate: (y: WorkflowYDocHandles, workflowId: string) => void,
): void => {
  const runtime = getWorkflowYjsRuntimeForWorkflow(context.workflowId)
  if (!runtime) {
    return
  }
  const clone = cloneYDoc(runtime.y)
  try {
    mutate(clone, runtime.workflowId)
    const candidate = exportWorkflowYjsSnapshot(clone)
    validateWorkflowCanvasGraph(candidate.nodes, candidate.edges)
    runtime.y.ydoc.transact(() => mutate(runtime.y, runtime.workflowId), 'mina-local')
  } finally {
    clone.ydoc.destroy()
  }
}

const cloneYDoc = (source: WorkflowYDocHandles): WorkflowYDocHandles => {
  const clone = createWorkflowYDoc()
  for (const [id, node] of source.nodes.entries()) {
    clone.nodes.set(id, structuredClone(node))
  }
  for (const [id, frame] of source.nodeFrames.entries()) {
    clone.nodeFrames.set(id, structuredClone(frame))
  }
  if (source.nodeOrder.length > 0) {
    clone.nodeOrder.push(source.nodeOrder.toArray())
  }
  for (const [id, edge] of source.edges.entries()) {
    clone.edges.set(id, structuredClone(edge))
  }
  if (source.edgeOrder.length > 0) {
    clone.edgeOrder.push(source.edgeOrder.toArray())
  }
  return clone
}

const frameFromNode = (node: WorkflowCanvasNode): Partial<WorkflowCanvasNode> => ({
  position: node.position,
  ...(node.parentId ? { parentId: node.parentId } : {}),
  ...(node.extent ? { extent: node.extent } : {}),
  ...(node.width !== undefined ? { width: node.width } : {}),
  ...(node.height !== undefined ? { height: node.height } : {}),
})

const upsertNode = (y: WorkflowYDocHandles, node: WorkflowCanvasNode): void => {
  y.nodes.set(node.id, structuredClone(node))
  y.nodeFrames.set(node.id, frameFromNode(node))
  if (!y.nodeOrder.toArray().includes(node.id)) {
    y.nodeOrder.push([node.id])
  }
}

const updateNode = (y: WorkflowYDocHandles, node: WorkflowCanvasNode): void => {
  if (y.nodes.has(node.id)) {
    y.nodes.set(node.id, structuredClone(node))
  }
}

const upsertEdge = (y: WorkflowYDocHandles, edge: WorkflowCanvasEdge): void => {
  y.edges.set(edge.id, structuredClone(edge))
  if (!y.edgeOrder.toArray().includes(edge.id)) {
    y.edgeOrder.push([edge.id])
  }
}

const deleteEdge = (y: WorkflowYDocHandles, edgeId: string): void => {
  y.edges.delete(edgeId)
  const index = y.edgeOrder.toArray().indexOf(edgeId)
  if (index >= 0) {
    y.edgeOrder.delete(index, 1)
  }
}

const deleteNode = (y: WorkflowYDocHandles, nodeId: string): void => {
  y.nodes.delete(nodeId)
  y.nodeFrames.delete(nodeId)
  const index = y.nodeOrder.toArray().indexOf(nodeId)
  if (index >= 0) {
    y.nodeOrder.delete(index, 1)
  }
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

export const workflowYjsCommands = {
  addMediaConnection(context: WorkflowYjsCommandContext, input: MediaConnectionInput): void {
    const { nodes } = context
    const source = nodes.find((node) => node.id === input.sourceId)
    const target = nodes.find((node) => node.id === input.targetId)
    if (!source || !target || source.id === target.id) {
      return
    }

    if (!isMediaGenerationNode(target)) {
      const edge: WorkflowCanvasEdge = {
        id: createStoreId('edge'),
        type: 'media',
        source: input.sourceId,
        target: input.targetId,
        ...(input.sourceHandle ? { sourceHandle: input.sourceHandle } : {}),
        ...(input.targetHandle ? { targetHandle: input.targetHandle } : {}),
        data: {},
      }
      withYDoc(context, (y) => upsertEdge(y, edge))
      return
    }

    const requestedSlot = mediaSlotFromHandleId(target.data.nodeType, input.targetHandle)
    const slot = coerceMediaSlotForNodeType(target.data.nodeType, requestedSlot)
    if (!slot) {
      return
    }

    const targetSlotItemId = createStoreId('slot_item')
    const existingItems = target.data.mediaSlots?.[slot] ?? []
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
      return
    }
    node.data.mediaSlots = {
      ...(node.data.mediaSlots ?? {}),
      [slot]: normalizeSlotOrder([...existingItems, item]),
    }
    const edge = createMediaEdge(input, targetSlotItemId, slot)
    withYDoc(context, (y) => {
      updateNode(y, node)
      upsertEdge(y, edge)
    })
  },

  addNode(context: WorkflowYjsCommandContext, type: WorkflowNodeType): void {
    const node = createWorkflowCanvasNode(type, context.nodes.length)
    withYDoc(context, (y) => upsertNode(y, node))
  },

  commitNodeFrames(context: WorkflowYjsCommandContext, frames: readonly CanvasNodeFramePatch[]): void {
    if (frames.length === 0) {
      return
    }
    withYDoc(context, (y) => {
      for (const frame of frames) {
        const current = y.nodes.get(frame.nodeId) as WorkflowCanvasNode | undefined
        if (!current) {
          continue
        }
        const currentFrame = y.nodeFrames.get(frame.nodeId) as Partial<WorkflowCanvasNode> | undefined
        y.nodeFrames.set(frame.nodeId, {
          ...(currentFrame ?? {}),
          position: frame.position ?? current.position,
          ...(frame.parentId !== undefined ? { parentId: frame.parentId } : {}),
          ...(frame.width !== undefined ? { width: frame.width } : {}),
          ...(frame.height !== undefined ? { height: frame.height } : {}),
        })
      }
    })
  },

  removeGraphEdges(context: WorkflowYjsCommandContext, edgeIds: readonly string[]): void {
    const removedIds = new Set(edgeIds)
    if (removedIds.size === 0) {
      return
    }
    const { edges, nodes } = context
    const removedEdges = edges.filter((edge) => removedIds.has(edge.id))
    if (removedEdges.length === 0) {
      return
    }
    const nextNodes = removedEdges.reduce(
      (items, edge) => items.map((node) => (node.id === edge.target ? removeEdgeSlotItem(node, edge) : node)),
      nodes,
    )
    const touchedNodes = new Set(removedEdges.map((edge) => edge.target))
    withYDoc(context, (y) => {
      for (const edgeId of removedIds) {
        deleteEdge(y, edgeId)
      }
      for (const node of nextNodes.filter((node) => touchedNodes.has(node.id))) {
        updateNode(y, node)
      }
    })
  },

  removeGraphNodes(context: WorkflowYjsCommandContext, nodeIds: readonly string[]): void {
    const removedIds = new Set(nodeIds)
    if (removedIds.size === 0) {
      return
    }
    const { edges, nodes } = context
    const removedEdges = edges.filter((edge) => removedIds.has(edge.source) || removedIds.has(edge.target))
    const nextNodes = removedEdges.reduce(
      (items, edge) => items.map((node) => (node.id === edge.target ? removeEdgeSlotItem(node, edge) : node)),
      nodes.filter((node) => !removedIds.has(node.id)),
    )
    const touchedNodes = new Set(removedEdges.map((edge) => edge.target).filter((nodeId) => !removedIds.has(nodeId)))
    withYDoc(context, (y) => {
      for (const nodeId of removedIds) {
        deleteNode(y, nodeId)
      }
      for (const edge of removedEdges) {
        deleteEdge(y, edge.id)
      }
      for (const node of nextNodes.filter((node) => touchedNodes.has(node.id))) {
        updateNode(y, node)
      }
    })
  },

  setNodeFrame(context: WorkflowYjsCommandContext, input: CanvasNodeFramePatch): void {
    workflowYjsCommands.commitNodeFrames(context, [input])
  },

  updateNodeById(context: WorkflowYjsCommandContext, nodeId: string, update: (node: WorkflowCanvasNode) => WorkflowCanvasNode | undefined): void {
    const node = context.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) {
      return
    }
    const next = update(structuredClone(node))
    if (!next) {
      return
    }
    withYDoc(context, (y) => updateNode(y, next))
  },

  addSlotItem(context: WorkflowYjsCommandContext, nodeId: string, item: NodeMediaSlotItem): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      if (!isMediaGenerationNode(node) || !isMediaSlotAllowedForNodeType(node.data.nodeType, item.slot)) {
        return undefined
      }
      const items = node.data.mediaSlots?.[item.slot] ?? []
      node.data.mediaSlots = {
        ...(node.data.mediaSlots ?? {}),
        [item.slot]: normalizeSlotOrder([...items, item]),
      }
      return node
    })
  },

  removeSlotItem(context: WorkflowYjsCommandContext, nodeId: string, slot: MediaSlotName, slotItemId: string): void {
    const { edges } = context
    const removedEdgeIds = edges
      .filter((edge) => edge.data.connection?.targetSlotItemId === slotItemId)
      .map((edge) => edge.id)
    const currentNode = context.nodes.find((node) => node.id === nodeId)
    if (!currentNode) {
      return
    }
    const nextNode = structuredClone(currentNode)
    if (!isMediaGenerationNode(nextNode)) {
      return
    }
    nextNode.data.mediaSlots = {
      ...(nextNode.data.mediaSlots ?? {}),
      [slot]: normalizeSlotOrder((nextNode.data.mediaSlots?.[slot] ?? []).filter((item) => item.id !== slotItemId)),
    }
    withYDoc(context, (y) => {
      updateNode(y, nextNode)
      for (const edgeId of removedEdgeIds) {
        deleteEdge(y, edgeId)
      }
    })
  },

  reorderSlotItem(context: WorkflowYjsCommandContext, nodeId: string, slot: MediaSlotName, slotItemId: string, direction: -1 | 1): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
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
    })
  },

  reorderSlotItems(context: WorkflowYjsCommandContext, nodeId: string, slot: MediaSlotName, orderedIds: readonly string[]): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
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
    })
  },

  replaceSlotItemMediaObject(context: WorkflowYjsCommandContext, nodeId: string, slot: MediaSlotName, slotItemId: string, mediaObjectId: string): void {
    const currentNode = context.nodes.find((node) => node.id === nodeId)
    if (!currentNode) {
      return
    }
    const nextNode = structuredClone(currentNode)
    if (!isMediaGenerationNode(nextNode)) {
      return
    }
    const removedEdgeIds = context.edges
      .filter((edge) => edge.data.connection?.targetSlotItemId === slotItemId)
      .map((edge) => edge.id)
    const items = nextNode.data.mediaSlots?.[slot] ?? []
    nextNode.data.mediaSlots = {
      ...(nextNode.data.mediaSlots ?? {}),
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
    withYDoc(context, (y) => {
      updateNode(y, nextNode)
      for (const edgeId of removedEdgeIds) {
        deleteEdge(y, edgeId)
      }
    })
  },

  setNodeMediaView(context: WorkflowYjsCommandContext, nodeId: string, mediaView: NodeMediaViewState | undefined): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      if (!isMediaGenerationNode(node)) {
        return undefined
      }
      if (mediaView) {
        node.data.mediaView = mediaView
      } else {
        delete node.data.mediaView
      }
      return node
    })
  },

  updateSlotItem(context: WorkflowYjsCommandContext, nodeId: string, item: NodeMediaSlotItem): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      if (!isMediaGenerationNode(node) || !isMediaSlotAllowedForNodeType(node.data.nodeType, item.slot)) {
        return undefined
      }
      const items = node.data.mediaSlots?.[item.slot] ?? []
      node.data.mediaSlots = {
        ...(node.data.mediaSlots ?? {}),
        [item.slot]: normalizeSlotOrder(items.map((candidate) => (candidate.id === item.id ? item : candidate))),
      }
      return node
    })
  },

  setNodeTaskConfig(context: WorkflowYjsCommandContext, nodeId: string, task: TaskDraftConfig): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      if (!isMediaGenerationNode(node)) {
        return undefined
      }
      node.data.config.task = task
      return node
    })
  },

  setNodeText(context: WorkflowYjsCommandContext, nodeId: string, text: string): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      if (node.data.nodeType !== 'text') {
        return undefined
      }
      node.data.config.text = text
      return node
    })
  },
}

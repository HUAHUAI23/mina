import type { WorkflowCanvasEdge, WorkflowCanvasNode, WorkflowNodeType } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem, NodeMediaSlots } from '@mina/contracts/modules/media'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

import { createWorkflowCanvasNode, isMediaGenerationNode } from '../../domain/canvas-node-types'
import {
  coerceMediaSlotForNodeType,
  defaultSelectorForMediaSlot,
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
import type { CanvasNodeFramePatch, MediaConnectionInput } from '../../store/store-types'
import { exportWorkflowSnapshotFromYjs, writeWorkflowNode, type WorkflowYDocHandles } from './yjs-document'
import { getWorkflowYjsRuntimeForWorkflow } from './workflow-yjs-store'
import { validateWorkflowCanvasGraph } from '../../domain/canvas-graph-validation'

export interface WorkflowYjsCommandContext {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
  workflowId: string
}

const withYDoc = (
  context: WorkflowYjsCommandContext,
  apply: (y: WorkflowYDocHandles, workflowId: string) => void,
): void => {
  const runtime = getWorkflowYjsRuntimeForWorkflow(context.workflowId)
  if (!runtime) {
    throw new Error(`Yjs runtime not registered for workflow ${context.workflowId}`)
  }
  runtime.y.ydoc.transact(() => apply(runtime.y, runtime.workflowId), 'mina-local')
  if (!import.meta.env.PROD) {
    const snapshot = exportWorkflowSnapshotFromYjs(runtime.y)
    validateWorkflowCanvasGraph(snapshot.nodes, snapshot.edges)
  }
}

const withNodeFrameYDoc = (
  context: WorkflowYjsCommandContext,
  mutate: (y: WorkflowYDocHandles, workflowId: string) => void,
): void => {
  const runtime = getWorkflowYjsRuntimeForWorkflow(context.workflowId)
  if (!runtime) {
    return
  }
  runtime.y.ydoc.transact(() => mutate(runtime.y, runtime.workflowId), 'mina-local')
}

const frameFromNode = (node: WorkflowCanvasNode): Partial<WorkflowCanvasNode> => ({
  position: node.position,
  ...(node.parentId ? { parentId: node.parentId } : {}),
  ...(node.extent ? { extent: node.extent } : {}),
  ...(node.width !== undefined ? { width: node.width } : {}),
  ...(node.height !== undefined ? { height: node.height } : {}),
})

const upsertNode = (y: WorkflowYDocHandles, node: WorkflowCanvasNode): void => {
  writeWorkflowNode(y.nodes, node)
  y.nodeFrames.set(node.id, frameFromNode(node))
  if (!y.nodeOrder.toArray().includes(node.id)) {
    y.nodeOrder.push([node.id])
  }
}

const updateNode = (y: WorkflowYDocHandles, node: WorkflowCanvasNode): void => {
  if (!y.nodes.has(node.id)) {
    return
  }
  writeWorkflowNode(y.nodes, node)
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

const isFinitePosition = (position: { x: number; y: number } | undefined): boolean =>
  position === undefined || (Number.isFinite(position.x) && Number.isFinite(position.y))

const isPositiveFiniteDimension = (value: number | undefined): boolean =>
  value === undefined || (Number.isFinite(value) && value > 0)

const isValidParentId = (parentId: string | undefined): boolean =>
  parentId === undefined || parentId.length > 0

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

const mediaCapabilitiesForTask = (task: TaskDraftConfig | undefined) =>
  task ? resolveClientModel({ kind: task.kind, model: task.model, provider: task.provider })?.mediaCapabilities : undefined

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
    const capabilities = mediaCapabilitiesForTask(target.data.config.task)
    const slot = coerceMediaSlotForNodeType(target.data.nodeType, requestedSlot, capabilities)
    if (!slot) {
      return
    }

    const targetSlotItemId = createStoreId('slot_item')
    const slotDescriptor = mediaSlotsForNodeType(target.data.nodeType, capabilities).find((descriptor) => descriptor.slot === slot)
    const existingItems = target.data.mediaSlots?.[slot] ?? []
    if (slotDescriptor?.maxItems !== undefined && existingItems.length >= slotDescriptor.maxItems) {
      return
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
      return
    }
    node.data.mediaSlots = {
      ...(node.data.mediaSlots ?? {}),
      [slot]: normalizeSlotOrder([...existingItems, item]),
    }
    if (node.data.config.task) {
      node.data.config.task = taskWithCompatibleModel(node.data.config.task, node.data.mediaSlots)
    }
    const edge = createMediaEdge(input, targetSlotItemId, slot)
    withYDoc(context, (y) => {
      updateNode(y, node)
      upsertEdge(y, edge)
    })
  },

  addNode(context: WorkflowYjsCommandContext, type: WorkflowNodeType, task?: TaskDraftConfig | undefined): string {
    const node = createWorkflowCanvasNode(type, context.nodes.length, task)
    withYDoc(context, (y) => upsertNode(y, node))
    return node.id
  },

  addMediaGenerationNode(context: WorkflowYjsCommandContext, input: {
    mediaSlots?: NodeMediaSlots | undefined
    nodeType: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>
    position?: { x: number; y: number } | undefined
    task: TaskDraftConfig
  }): string {
    const node = createWorkflowCanvasNode(input.nodeType, context.nodes.length, input.task)
    if (!isMediaGenerationNode(node)) {
      return node.id
    }
    if (input.position) {
      node.position = input.position
    }
    node.data.config.task = input.task
    node.data.mediaSlots = normalizeMediaSlotsForNodeType(input.nodeType, input.mediaSlots, mediaCapabilitiesForTask(input.task))
    node.data.config.task = taskWithCompatibleModel(node.data.config.task, node.data.mediaSlots)
    withYDoc(context, (y) => upsertNode(y, node))
    return node.id
  },

  commitNodeFrames(context: WorkflowYjsCommandContext, frames: readonly CanvasNodeFramePatch[]): void {
    if (frames.length === 0) {
      return
    }
    const nodesById = new Map(context.nodes.map((node) => [node.id, node]))
    const validFrames = frames.filter((frame) => {
      if (!nodesById.has(frame.nodeId)) {
        return false
      }
      return (
        isFinitePosition(frame.position) &&
        isPositiveFiniteDimension(frame.width) &&
        isPositiveFiniteDimension(frame.height) &&
        isValidParentId(frame.parentId)
      )
    })
    if (validFrames.length === 0) {
      return
    }
    withNodeFrameYDoc(context, (y) => {
      for (const frame of validFrames) {
        const current = nodesById.get(frame.nodeId)
        if (!current) {
          continue
        }
        const currentFrame = y.nodeFrames.get(frame.nodeId) as Partial<WorkflowCanvasNode> | undefined
        y.nodeFrames.set(frame.nodeId, {
          ...(currentFrame ?? {}),
          position: frame.position ?? currentFrame?.position ?? current.position,
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
    const nextNodes = updateNodesWithCompatibleMediaModels(removedEdges.reduce(
      (items, edge) => items.map((node) => (node.id === edge.target ? removeEdgeSlotItem(node, edge) : node)),
      nodes,
    ))
    const touchedNodes = new Set(removedEdges.map((edge) => edge.target))
    const touchedNextNodes = nextNodes.filter((node) => touchedNodes.has(node.id))
    withYDoc(context, (y) => {
      for (const edgeId of removedIds) {
        deleteEdge(y, edgeId)
      }
      for (const node of touchedNextNodes) {
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
    const nextNodes = updateNodesWithCompatibleMediaModels(removedEdges.reduce(
      (items, edge) => items.map((node) => (node.id === edge.target ? removeEdgeSlotItem(node, edge) : node)),
      nodes.filter((node) => !removedIds.has(node.id)),
    ))
    const touchedNodes = new Set(removedEdges.map((edge) => edge.target).filter((nodeId) => !removedIds.has(nodeId)))
    const touchedNextNodes = nextNodes.filter((node) => touchedNodes.has(node.id))
    withYDoc(context, (y) => {
      for (const nodeId of removedIds) {
        deleteNode(y, nodeId)
      }
      for (const edge of removedEdges) {
        deleteEdge(y, edge.id)
      }
      for (const node of touchedNextNodes) {
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
    if (nextNode.data.config.task) {
      nextNode.data.config.task = taskWithCompatibleModel(nextNode.data.config.task, nextNode.data.mediaSlots)
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
    if (nextNode.data.config.task) {
      nextNode.data.config.task = taskWithCompatibleModel(nextNode.data.config.task, nextNode.data.mediaSlots)
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

import { applyEdgeChanges, applyNodeChanges, addEdge } from '@xyflow/react'
import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react'
import type { NodeMediaViewState, WorkflowCanvasEdge, WorkflowCanvasNode, WorkflowNodeType } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'
import { produce } from 'immer'
import { create } from 'zustand'

import { defaultSelectorForSlot, defaultSlotForTarget, normalizeSlotOrder, removeEdgeSlotItem } from '../utils/media-slots'
import { shareFlowGroupScope } from '../utils/flow-scope'

interface CanvasDraftState {
  dirty: boolean
  edges: WorkflowCanvasEdge[]
  name: string
  nodes: WorkflowCanvasNode[]
  remoteUpdatePending: boolean
  remoteVersion: number | undefined
  saving: boolean
  selectedNodeIds: string[]
  version: number
  workflowId: string
}

interface CanvasDraftActions {
  addNode(type: WorkflowNodeType): void
  applyRemoteMediaView(nodeId: string, mediaView: NodeMediaViewState | undefined, version: number): void
  clearRemoteUpdate(): void
  initialize(input: { edges: WorkflowCanvasEdge[]; name: string; nodes: WorkflowCanvasNode[]; version: number; workflowId: string }): void
  markClean(input: { edges: WorkflowCanvasEdge[]; name: string; nodes: WorkflowCanvasNode[]; version: number }): void
  onConnect(connection: Connection): void
  onEdgesChange(changes: EdgeChange[]): void
  onNodesChange(changes: NodeChange[]): void
  removeSlotItem(nodeId: string, slot: MediaSlotName, slotItemId: string): void
  reorderSlotItem(nodeId: string, slot: MediaSlotName, slotItemId: string, direction: -1 | 1): void
  addSlotItem(nodeId: string, item: NodeMediaSlotItem): void
  selectNodeIds(ids: string[]): void
  setNodeTaskConfig(nodeId: string, task: TaskDraftConfig): void
  setNodeText(nodeId: string, text: string): void
  setRemoteUpdate(version: number): void
  setSaving(saving: boolean): void
  updateSlotItem(nodeId: string, item: NodeMediaSlotItem): void
}

type CanvasStore = CanvasDraftState & CanvasDraftActions

const emptyState: CanvasDraftState = {
  dirty: false,
  edges: [],
  name: '',
  nodes: [],
  remoteUpdatePending: false,
  remoteVersion: undefined,
  saving: false,
  selectedNodeIds: [],
  version: 1,
  workflowId: '',
}

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const defaultTask = (type: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>): TaskDraftConfig =>
  type === 'image_generation'
    ? {
        kind: 'image_generation',
        provider: 'dev',
        model: 'dev-image',
        prompt: 'Describe the image',
        params: { count: 1, size: '1024x1024' },
      }
    : {
        kind: 'video_generation',
        provider: 'dev',
        model: 'dev-video',
        prompt: 'Describe the motion',
        params: { durationSeconds: 5, outputLastFrame: false, resolution: '720p' },
      }

const createNode = (type: WorkflowNodeType, index: number): WorkflowCanvasNode => {
  const position = { x: 120 + (index % 4) * 280, y: 120 + Math.floor(index / 4) * 220 }
  if (type === 'image_generation') {
    return {
      id: createId('node'),
      type,
      position,
      width: 240,
      data: { nodeType: type, title: 'Image Node', config: { task: defaultTask(type) }, mediaSlots: {} },
    }
  }
  if (type === 'video_generation') {
    return {
      id: createId('node'),
      type,
      position,
      width: 260,
      data: { nodeType: type, title: 'Video Node', config: { task: defaultTask(type) }, mediaSlots: {} },
    }
  }
  if (type === 'flow_group') {
    return {
      id: createId('group'),
      type,
      position,
      width: 560,
      height: 340,
      data: { nodeType: type, title: 'Flow Group', config: {} },
    }
  }
  if (type === 'node_group') {
    return {
      id: createId('group'),
      type,
      position,
      width: 520,
      height: 300,
      data: { nodeType: type, title: 'Node Group', config: {} },
    }
  }
  return {
    id: createId('note'),
    type,
    position,
    width: 220,
    data: { nodeType: type, title: 'Text', config: { text: '' } },
  }
}

const toFlowNode = (node: WorkflowCanvasNode): Node => ({
  id: node.id,
  type: node.type,
  position: node.position,
  data: node.data as unknown as Record<string, unknown>,
  ...(node.parentId ? { parentId: node.parentId } : {}),
  ...(node.extent ? { extent: node.extent } : {}),
  ...(node.width !== undefined ? { width: node.width } : {}),
  ...(node.height !== undefined ? { height: node.height } : {}),
})

const fromFlowNode = (node: Node, existing: WorkflowCanvasNode): WorkflowCanvasNode => ({
  ...existing,
  position: node.position,
  ...(node.parentId ? { parentId: node.parentId } : {}),
  ...(node.measured?.width ? { width: node.measured.width } : existing.width !== undefined ? { width: existing.width } : {}),
  ...(node.measured?.height ? { height: node.measured.height } : existing.height !== undefined ? { height: existing.height } : {}),
})

const toFlowEdge = (edge: WorkflowCanvasEdge): Edge => ({
  id: edge.id,
  type: edge.type,
  source: edge.source,
  target: edge.target,
  sourceHandle: edge.sourceHandle ?? null,
  targetHandle: edge.targetHandle ?? null,
  data: edge.data as unknown as Record<string, unknown>,
})

const fromFlowEdge = (edge: Edge, existing: WorkflowCanvasEdge): WorkflowCanvasEdge => ({
  ...existing,
  source: edge.source,
  target: edge.target,
  ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
  ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
})

export const useCanvasStore = create<CanvasStore>((set) => ({
  ...emptyState,
  addNode: (type) =>
    set((state) => ({
      dirty: true,
      nodes: [...state.nodes, createNode(type, state.nodes.length)],
      selectedNodeIds: [],
    })),
  addSlotItem: (nodeId, item) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((candidate) => candidate.id === nodeId)
        if (!node || (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation')) {
          return
        }
        const items = node.data.mediaSlots?.[item.slot] ?? []
        node.data.mediaSlots = {
          ...(node.data.mediaSlots ?? {}),
          [item.slot]: normalizeSlotOrder([...items, item]),
        }
        state.dirty = true
      }),
    ),
  applyRemoteMediaView: (nodeId, mediaView, version) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId || (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation')) {
          return node
        }
        const { mediaView: _mediaView, ...dataWithoutMediaView } = node.data
        return {
          ...node,
          data: mediaView ? { ...node.data, mediaView } : dataWithoutMediaView,
        }
      }),
      version,
    })),
  clearRemoteUpdate: () => set({ remoteUpdatePending: false, remoteVersion: undefined }),
  initialize: (input) =>
    set({
      dirty: false,
      edges: input.edges,
      name: input.name,
      nodes: input.nodes,
      remoteUpdatePending: false,
      remoteVersion: undefined,
      saving: false,
      selectedNodeIds: [],
      version: input.version,
      workflowId: input.workflowId,
    }),
  markClean: (input) =>
    set({
      dirty: false,
      edges: input.edges,
      name: input.name,
      nodes: input.nodes,
      remoteUpdatePending: false,
      remoteVersion: undefined,
      saving: false,
      version: input.version,
    }),
  onConnect: (connection) =>
    set(
      produce<CanvasStore>((state) => {
        if (!connection.source || !connection.target) {
          return
        }
        const source = state.nodes.find((node) => node.id === connection.source)
        const target = state.nodes.find((node) => node.id === connection.target)
        if (!source || !target || (target.data.nodeType !== 'image_generation' && target.data.nodeType !== 'video_generation')) {
          return
        }
        const slot = (connection.targetHandle as MediaSlotName | undefined) ?? defaultSlotForTarget(target)
        const targetSlotItemId = createId('slot_item')
        const existingItems = target.data.mediaSlots?.[slot] ?? []
        const useRunOutput = shareFlowGroupScope(source, target, state.nodes)
        const item: NodeMediaSlotItem = {
          id: targetSlotItemId,
          order: existingItems.length,
          required: true,
          slot,
          source: useRunOutput
            ? { type: 'node_output', nodeId: source.id, resolve: 'run_output', selector: defaultSelectorForSlot(slot) }
            : { type: 'node_output', nodeId: source.id, resolve: 'current_media' },
        }
        target.data.mediaSlots = {
          ...(target.data.mediaSlots ?? {}),
          [slot]: normalizeSlotOrder([...existingItems, item]),
        }
        const nextEdge: WorkflowCanvasEdge = {
          id: createId('edge'),
          type: 'media',
          source: source.id,
          target: target.id,
          ...(connection.sourceHandle ? { sourceHandle: connection.sourceHandle } : {}),
          ...(connection.targetHandle ? { targetHandle: connection.targetHandle } : {}),
          data: { connection: { kind: 'media_link', targetSlot: slot, targetSlotItemId } },
        }
        state.edges = addEdge(toFlowEdge(nextEdge), state.edges.map(toFlowEdge)).map((edge) =>
          edge.id === nextEdge.id ? nextEdge : fromFlowEdge(edge, state.edges.find((item) => item.id === edge.id) ?? nextEdge),
        )
        state.dirty = true
      }),
    ),
  onEdgesChange: (changes) =>
    set((state) => {
      const removedIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id))
      const removedEdges = state.edges.filter((edge) => removedIds.has(edge.id))
      const existingById = new Map(state.edges.map((edge) => [edge.id, edge]))
      const edges = applyEdgeChanges(changes, state.edges.map(toFlowEdge))
        .map((edge) => {
          const existing = existingById.get(edge.id)
          return existing ? fromFlowEdge(edge, existing) : undefined
        })
        .filter((edge): edge is WorkflowCanvasEdge => Boolean(edge))
      const nodes = removedEdges.reduce(
        (items, edge) => items.map((node) => (node.id === edge.target ? removeEdgeSlotItem(node, edge) : node)),
        state.nodes,
      )
      return { dirty: true, edges, nodes }
    }),
  onNodesChange: (changes) =>
    set((state) => {
      const selectionChanges = changes.filter((change) => change.type === 'select')
      const selectedNodeIds =
        selectionChanges.length > 0
          ? selectionChanges.filter((change) => change.selected).map((change) => change.id)
          : state.selectedNodeIds
      return {
        dirty: state.dirty || changes.some((change) => change.type !== 'select'),
        nodes: applyNodeChanges(changes, state.nodes.map(toFlowNode)).map((node) => {
          const existing = state.nodes.find((item) => item.id === node.id)
          return existing ? fromFlowNode(node, existing) : (node as unknown as WorkflowCanvasNode)
        }),
        selectedNodeIds,
      }
    }),
  removeSlotItem: (nodeId, slot, slotItemId) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item) => item.id === nodeId)
        if (!node || (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation')) {
          return
        }
        node.data.mediaSlots = {
          ...(node.data.mediaSlots ?? {}),
          [slot]: normalizeSlotOrder((node.data.mediaSlots?.[slot] ?? []).filter((item) => item.id !== slotItemId)),
        }
        state.edges = state.edges.filter((edge) => edge.data.connection.targetSlotItemId !== slotItemId)
        state.dirty = true
      }),
    ),
  reorderSlotItem: (nodeId, slot, slotItemId, direction) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item) => item.id === nodeId)
        if (!node || (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation')) {
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
        node.data.mediaSlots = { ...(node.data.mediaSlots ?? {}), [slot]: normalizeSlotOrder(items) }
        state.dirty = true
      }),
    ),
  selectNodeIds: (ids) => set({ selectedNodeIds: ids }),
  setNodeTaskConfig: (nodeId, task) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item) => item.id === nodeId)
        if (node?.data.nodeType !== 'image_generation' && node?.data.nodeType !== 'video_generation') {
          return
        }
        node.data.config.task = task
        state.dirty = true
      }),
    ),
  setNodeText: (nodeId, text) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item) => item.id === nodeId)
        if (node?.data.nodeType !== 'text') {
          return
        }
        node.data.config.text = text
        state.dirty = true
      }),
    ),
  setRemoteUpdate: (version) => set({ remoteUpdatePending: true, remoteVersion: version }),
  setSaving: (saving) => set({ saving }),
  updateSlotItem: (nodeId, item) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((candidate) => candidate.id === nodeId)
        if (!node || (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation')) {
          return
        }
        const items = node.data.mediaSlots?.[item.slot] ?? []
        node.data.mediaSlots = {
          ...(node.data.mediaSlots ?? {}),
          [item.slot]: normalizeSlotOrder(items.map((candidate) => (candidate.id === item.id ? item : candidate))),
        }
        state.dirty = true
      }),
    ),
}))

export const getCanvasSnapshot = () => {
  const state = useCanvasStore.getState()
  return {
    dirty: state.dirty,
    edges: state.edges,
    name: state.name,
    nodes: state.nodes,
    version: state.version,
    workflowId: state.workflowId,
  }
}

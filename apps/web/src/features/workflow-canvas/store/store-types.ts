import type { StateCreator } from 'zustand'
import type {
  NodeMediaViewState,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowNodeType,
} from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'
import type { XYPosition } from '@xyflow/react'

export interface CanvasNodeFramePatch {
  height?: number | undefined
  nodeId: string
  parentId?: string | undefined
  position?: XYPosition | undefined
  width?: number | undefined
}

export interface MediaConnectionInput {
  sourceHandle?: string | undefined
  sourceId: string
  targetHandle?: string | undefined
  targetId: string
}

export interface CanvasGraphState {
  edges: WorkflowCanvasEdge[]
  name: string
  nodeIndexById: Record<string, number>
  nodes: WorkflowCanvasNode[]
  workflowId: string
}

export interface CanvasGraphActions {
  addMediaConnection(input: MediaConnectionInput): void
  addNode(type: WorkflowNodeType): void
  commitNodeFrames(input: readonly CanvasNodeFramePatch[]): void
  removeGraphEdges(edgeIds: readonly string[]): void
  removeGraphNodes(nodeIds: readonly string[]): void
  setNodeFrame(input: CanvasNodeFramePatch): void
}

export interface CanvasDraftState {
  version: number
  yjsConnectionStatus: 'connected' | 'connecting' | 'disconnected' | 'synced'
}

export interface CanvasDraftActions {
  setYjsConnectionStatus(status: CanvasDraftState['yjsConnectionStatus']): void
}

export interface CanvasHydrationActions {
  applyRemoteSnapshot(input: {
    allowEmpty?: boolean | undefined
    edges: WorkflowCanvasEdge[]
    nodes: WorkflowCanvasNode[]
    source?: 'server' | 'yjs' | undefined
    version?: number | undefined
    workflowId: string
  }): void
  hydrateFromServer(input: {
    edges: WorkflowCanvasEdge[]
    name: string
    nodes: WorkflowCanvasNode[]
    version: number
    workflowId: string
  }): void
}

export interface CanvasHydrationState {
  hydratedWorkflowId: string | undefined
}

export interface CanvasMediaSlotActions {
  addSlotItem(nodeId: string, item: NodeMediaSlotItem): void
  removeSlotItem(nodeId: string, slot: MediaSlotName, slotItemId: string): void
  reorderSlotItem(nodeId: string, slot: MediaSlotName, slotItemId: string, direction: -1 | 1): void
  reorderSlotItems(nodeId: string, slot: MediaSlotName, orderedIds: readonly string[]): void
  replaceSlotItemMediaObject(nodeId: string, slot: MediaSlotName, slotItemId: string, mediaObjectId: string): void
  setNodeMediaView(nodeId: string, mediaView: NodeMediaViewState | undefined): void
  updateSlotItem(nodeId: string, item: NodeMediaSlotItem): void
}

export interface CanvasRemoteState {}

export interface CanvasRemoteActions {}

export interface CanvasTaskConfigActions {
  setNodeTaskConfig(nodeId: string, task: TaskDraftConfig): void
  setNodeText(nodeId: string, text: string): void
}

export type CanvasStore = CanvasGraphState &
  CanvasGraphActions &
  CanvasDraftState &
  CanvasDraftActions &
  CanvasHydrationState &
  CanvasHydrationActions &
  CanvasMediaSlotActions &
  CanvasRemoteState &
  CanvasRemoteActions &
  CanvasTaskConfigActions

export type CanvasSliceCreator<TSlice> = StateCreator<CanvasStore, [], [], TSlice>

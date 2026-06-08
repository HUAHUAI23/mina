import type { StateCreator } from 'zustand'
import type {
  NodeMediaViewState,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowNodeType,
} from '@mina/contracts/modules/canvas'
import type { WorkflowGroupNodeType } from '@mina/contracts/modules/canvas/group-conversion'
import type { MediaSlotName, NodeMediaSlotItem, NodeMediaSlots } from '@mina/contracts/modules/media'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'
import type { XYPosition } from '@xyflow/react'

export interface CanvasNodeFramePatch {
  height?: number | undefined
  nodeId: string
  parentId?: string | undefined
  position?: XYPosition | undefined
  width?: number | undefined
}

export interface AddNodeOptions {
  parentId?: string | undefined
  position?: XYPosition | undefined
}

export interface AddNodesToGroupOptions {
  absolutePositionsByNodeId?: Record<string, XYPosition> | undefined
}

export interface AddConnectedMediaGenerationNodeInput {
  nodeType: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>
  position: XYPosition
  sourceHandle?: string | undefined
  sourceId: string
  task: TaskDraftConfig
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
  addConnectedMediaGenerationNode(input: AddConnectedMediaGenerationNodeInput): string | undefined
  addMediaConnection(input: MediaConnectionInput): void
  addMediaGenerationNode(input: {
    mediaSlots?: NodeMediaSlots | undefined
    nodeType: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>
    parentId?: string | undefined
    position?: XYPosition | undefined
    task: TaskDraftConfig
  }): string
  addNode(type: WorkflowNodeType, task?: TaskDraftConfig | undefined, options?: AddNodeOptions | undefined): string
  addNodesToGroup(groupNodeId: string, nodeIds: readonly string[], options?: AddNodesToGroupOptions | undefined): string[]
  commitNodeFrames(input: readonly CanvasNodeFramePatch[]): void
  convertGroupNodeType(nodeId: string, targetType: WorkflowGroupNodeType): void
  detachGraphNodes(nodeIds: readonly string[]): void
  fitGroupNodeToChildren(nodeId: string): void
  groupGraphNodes(nodeIds: readonly string[], groupType: WorkflowGroupNodeType): string | undefined
  redo(): void
  removeGraphEdges(edgeIds: readonly string[]): void
  removeGraphNodes(nodeIds: readonly string[]): void
  ungroupGraphNode(nodeId: string): void
  setNodeFrame(input: CanvasNodeFramePatch): void
  undo(): void
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
  setNodeTaskPrompt(nodeId: string, prompt: string): void
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

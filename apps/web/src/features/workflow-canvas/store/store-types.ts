import type { XYPosition } from '@xyflow/react'
import type { StateCreator } from 'zustand'
import type {
  NodeMediaViewState,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowNodeType,
} from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

export interface CanvasNodeFramePatch {
  height?: number | undefined
  nodeId: string
  parentId?: string | undefined
  position?: XYPosition | undefined
  width?: number | undefined
}

export type CanvasDocumentTransaction =
  | {
      changes: Array<{
        nodeId: string
        parentId?: string | undefined
        position?: XYPosition | undefined
        width?: number | undefined
        height?: number | undefined
      }>
      type: 'move_nodes'
    }
  | {
      edge: WorkflowCanvasEdge
      node: WorkflowCanvasNode
      type: 'connect_media_slot'
    }
  | {
      edge: WorkflowCanvasEdge
      type: 'upsert_edge'
    }
  | {
      edgeId: string
      type: 'remove_edge'
    }
  | {
      node: WorkflowCanvasNode
      type: 'upsert_node'
    }
  | {
      nodeId: string
      type: 'remove_node'
    }
  | {
      node: WorkflowCanvasNode
      type: 'update_node'
    }
  | {
      edges: readonly WorkflowCanvasEdge[]
      nodes: readonly WorkflowCanvasNode[]
      type: 'replace_snapshot'
    }

export interface CanvasDocumentTransactionEntry {
  revision: number
  transaction: CanvasDocumentTransaction
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
  dirty: boolean
  draftRevision: number
  lastDocumentTransaction: CanvasDocumentTransactionEntry | undefined
  savedRevision: number
  saving: boolean
  version: number
}

export interface CanvasDraftActions {
  acknowledgeSaved(input: { revision: number; version: number }): void
  markDraftChanged(): void
  setSaving(saving: boolean): void
}

export interface CanvasHydrationActions {
  applyRemoteSnapshot(input: {
    edges: WorkflowCanvasEdge[]
    nodes: WorkflowCanvasNode[]
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
  updateSlotItem(nodeId: string, item: NodeMediaSlotItem): void
}

export interface CanvasRemoteState {
  remoteUpdatePending: boolean
  remoteVersion: number | undefined
}

export interface CanvasRemoteActions {
  applyRemoteMediaView(nodeId: string, mediaView: NodeMediaViewState | undefined, version: number): void
  clearRemoteUpdate(): void
  setRemoteUpdate(version: number): void
}

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

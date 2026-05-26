import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import { create } from 'zustand'
import type { EdgeChange, NodeChange, Viewport } from '@xyflow/react'

import {
  incrementCanvasPerfCounter,
  markCanvasPerformance,
} from '../diagnostics/canvas-performance-marks'
import { FlowProjectionCache } from './flow-projection-cache'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'

interface FlowRenderInteraction {
  draggingNodeIds: string[]
  localFrameNodeIds: string[]
  selectionDragActive: boolean
  viewportMoving: boolean
}

interface FlowRenderState {
  flowEdges: WorkflowFlowEdge[]
  flowEdgesById: Record<string, WorkflowFlowEdge>
  flowNodes: WorkflowFlowNode[]
  flowNodesById: Record<string, WorkflowFlowNode>
  interaction: FlowRenderInteraction
  lastViewport: Viewport | undefined
  projectionCache: FlowProjectionCache
}

interface FlowRenderActions {
  applyEdgeChanges(changes: EdgeChange<WorkflowFlowEdge>[]): void
  applyNodeChanges(changes: NodeChange<WorkflowFlowNode>[]): void
  hydrateFromDocument(input: {
    edges: readonly WorkflowCanvasEdge[]
    nodes: readonly WorkflowCanvasNode[]
    selectedNodeIds?: readonly string[] | undefined
  }): void
  releaseLocalFrameNodeIds(nodeIds: readonly string[]): void
  setDraggingNodeIds(nodeIds: readonly string[]): void
  setSelectionDragActive(active: boolean): void
  setLocalFrameNodeIds(nodeIds: readonly string[]): void
  setLastViewport(viewport: Viewport): void
  setViewportMoving(moving: boolean): void
}

type FlowRenderStore = FlowRenderState & FlowRenderActions

const indexFlowNodes = (nodes: readonly WorkflowFlowNode[]): Record<string, WorkflowFlowNode> =>
  Object.fromEntries(nodes.map((node) => [node.id, node]))

const indexFlowEdges = (edges: readonly WorkflowFlowEdge[]): Record<string, WorkflowFlowEdge> =>
  Object.fromEntries(edges.map((edge) => [edge.id, edge]))

const preserveNodeInteraction = (
  nodes: readonly WorkflowFlowNode[],
  previousNodes: Readonly<Record<string, WorkflowFlowNode>>,
  localFrameNodeIds: ReadonlySet<string>,
  selectedNodeIds?: ReadonlySet<string> | undefined,
): WorkflowFlowNode[] => {
  let changed = false
  const nextNodes = nodes.map((node) => {
    const previous = previousNodes[node.id]
    const selected = selectedNodeIds ? selectedNodeIds.has(node.id) : previous?.selected
    if (previous && localFrameNodeIds.has(node.id)) {
      const nextSelected = selected ?? previous.selected
      changed = true
      return {
        ...node,
        height: previous.height,
        measured: previous.measured,
        parentId: previous.parentId,
        position: previous.position,
        selected: nextSelected,
        width: previous.width,
      } as WorkflowFlowNode
    }
    if (selected === undefined || selected === node.selected) {
      return node
    }
    changed = true
    return { ...node, selected } as WorkflowFlowNode
  })
  return changed ? nextNodes : (nodes as WorkflowFlowNode[])
}

const preserveEdgeInteraction = (
  edges: readonly WorkflowFlowEdge[],
  previousEdges: Readonly<Record<string, WorkflowFlowEdge>>,
): WorkflowFlowEdge[] => {
  let changed = false
  const nextEdges = edges.map((edge) => {
    const previous = previousEdges[edge.id]
    if (previous?.selected === undefined || previous.selected === edge.selected) {
      return edge
    }
    changed = true
    return { ...edge, selected: previous.selected } as WorkflowFlowEdge
  })
  return changed ? nextEdges : (edges as WorkflowFlowEdge[])
}

const emptyInteraction = (): FlowRenderInteraction => ({
  draggingNodeIds: [],
  localFrameNodeIds: [],
  selectionDragActive: false,
  viewportMoving: false,
})

export const useFlowRenderStore = create<FlowRenderStore>((set, get) => ({
  flowEdges: [],
  flowEdgesById: {},
  flowNodes: [],
  flowNodesById: {},
  interaction: emptyInteraction(),
  lastViewport: undefined,
  projectionCache: new FlowProjectionCache(),
  applyEdgeChanges: (changes) => {
    if (changes.length === 0) {
      return
    }
    incrementCanvasPerfCounter('edgesChangeEvents')
    incrementCanvasPerfCounter('renderStateWrites')
    set((state) => {
      const flowEdges = applyEdgeChanges(changes, state.flowEdges)
      return { flowEdges, flowEdgesById: indexFlowEdges(flowEdges) }
    })
  },
  applyNodeChanges: (changes) => {
    if (changes.length === 0) {
      return
    }
    incrementCanvasPerfCounter('nodesChangeEvents')
    incrementCanvasPerfCounter('renderStateWrites')
    set((state) => {
      const flowNodes = applyNodeChanges(changes, state.flowNodes)
      return { flowNodes, flowNodesById: indexFlowNodes(flowNodes) }
    })
  },
  hydrateFromDocument: (input) => {
    const projected = get().projectionCache.projectGraph(input)
    const state = get()
    const localFrameNodeIds = new Set([
      ...state.interaction.draggingNodeIds,
      ...state.interaction.localFrameNodeIds,
    ])
    const selectedNodeIds = input.selectedNodeIds ? new Set(input.selectedNodeIds) : undefined
    const flowNodes = preserveNodeInteraction(projected.nodes, state.flowNodesById, localFrameNodeIds, selectedNodeIds)
    const flowEdges = preserveEdgeInteraction(projected.edges, state.flowEdgesById)
    if (state.flowNodes === flowNodes && state.flowEdges === flowEdges) {
      return
    }
    incrementCanvasPerfCounter('renderStateWrites')
    set({
      flowEdges,
      flowEdgesById: indexFlowEdges(flowEdges),
      flowNodes,
      flowNodesById: indexFlowNodes(flowNodes),
    })
  },
  releaseLocalFrameNodeIds: (nodeIds) =>
    set((state) => {
      const releasedIds = new Set(nodeIds)
      if (releasedIds.size === 0 || state.interaction.localFrameNodeIds.length === 0) {
        return state
      }
      const localFrameNodeIds = state.interaction.localFrameNodeIds.filter((nodeId) => !releasedIds.has(nodeId))
      if (localFrameNodeIds.length === state.interaction.localFrameNodeIds.length) {
        return state
      }
      return {
        interaction: {
          ...state.interaction,
          localFrameNodeIds,
        },
      }
    }),
  setDraggingNodeIds: (nodeIds) =>
    set((state) => ({
      interaction: {
        ...state.interaction,
        draggingNodeIds: Array.from(new Set(nodeIds)),
      },
    })),
  setSelectionDragActive: (active) =>
    set((state) => {
      if (state.interaction.selectionDragActive === active) {
        return state
      }
      return {
        interaction: {
          ...state.interaction,
          selectionDragActive: active,
        },
      }
    }),
  setLocalFrameNodeIds: (nodeIds) =>
    set((state) => {
      const localFrameNodeIds = Array.from(new Set(nodeIds))
      if (
        state.interaction.localFrameNodeIds.length === localFrameNodeIds.length &&
        state.interaction.localFrameNodeIds.every((nodeId, index) => nodeId === localFrameNodeIds[index])
      ) {
        return state
      }
      return {
        interaction: {
          ...state.interaction,
          localFrameNodeIds,
        },
      }
    }),
  setLastViewport: (viewport) => set({ lastViewport: viewport }),
  setViewportMoving: (moving) =>
    set((state) => {
      if (state.interaction.viewportMoving === moving) {
        return state
      }
      if (moving) {
        markCanvasPerformance('viewport:start')
      } else {
        markCanvasPerformance('viewport:stop')
      }
      return { interaction: { ...state.interaction, viewportMoving: moving } }
    }),
}))

export const getFlowRenderSnapshot = () => useFlowRenderStore.getState()

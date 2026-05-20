import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import { create } from 'zustand'
import type { EdgeChange, NodeChange, Viewport } from '@xyflow/react'

import {
  incrementCanvasPerfCounter,
  markCanvasPerformance,
} from '../diagnostics/canvas-performance-marks'
import { flowProjectionCache } from './flow-projection-cache'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'

interface FlowRenderInteraction {
  draggingNodeIds: string[]
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
}

interface FlowRenderActions {
  applyEdgeChanges(changes: EdgeChange<WorkflowFlowEdge>[]): void
  applyNodeChanges(changes: NodeChange<WorkflowFlowNode>[]): void
  hydrateFromDocument(input: {
    edges: readonly WorkflowCanvasEdge[]
    nodes: readonly WorkflowCanvasNode[]
  }): void
  setDraggingNodeIds(nodeIds: readonly string[]): void
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
): WorkflowFlowNode[] => {
  let changed = false
  const nextNodes = nodes.map((node) => {
    const previous = previousNodes[node.id]
    if (previous?.selected === undefined || previous.selected === node.selected) {
      return node
    }
    changed = true
    return { ...node, selected: previous.selected } as WorkflowFlowNode
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
    if (get().interaction.draggingNodeIds.length > 0) {
      return
    }
    const projected = flowProjectionCache.projectGraph(input)
    const state = get()
    const flowNodes = preserveNodeInteraction(projected.nodes, state.flowNodesById)
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
  setDraggingNodeIds: (nodeIds) =>
    set((state) => ({
      interaction: {
        ...state.interaction,
        draggingNodeIds: Array.from(new Set(nodeIds)),
      },
    })),
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

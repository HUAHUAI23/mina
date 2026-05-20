import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { getFlowRenderSnapshot, useFlowRenderStore } from './flow-render-store'

const fixture = createCanvasPerformanceFixture(20)

useFlowRenderStore.setState({
  flowEdges: [],
  flowEdgesById: {},
  flowNodes: [],
  flowNodesById: {},
  interaction: {
    draggingNodeIds: [],
    selectionDragActive: false,
    viewportMoving: false,
  },
  lastViewport: undefined,
})

useFlowRenderStore.getState().hydrateFromDocument(fixture)

const firstNode = getFlowRenderSnapshot().flowNodes[0]
if (!firstNode) {
  throw new Error('Expected hydrated flow nodes.')
}

useFlowRenderStore.getState().applyNodeChanges([
  {
    id: firstNode.id,
    selected: true,
    type: 'select',
  },
])
useFlowRenderStore.getState().applyEdgeChanges([
  {
    id: fixture.edges[0]?.id ?? 'missing',
    selected: true,
    type: 'select',
  },
])

const selectedBefore = getFlowRenderSnapshot().flowNodesById[firstNode.id]
if (!selectedBefore?.selected) {
  throw new Error('Expected node selection to be applied to the render store.')
}
const selectedEdgeBefore = getFlowRenderSnapshot().flowEdgesById[fixture.edges[0]?.id ?? 'missing']
if (!selectedEdgeBefore?.selected) {
  throw new Error('Expected edge selection to be applied to the render store.')
}

useFlowRenderStore.getState().hydrateFromDocument({
  edges: fixture.edges,
  nodes: fixture.nodes.map((node) =>
    node.id === firstNode.id
      ? {
          ...node,
          data: { ...node.data, title: 'Changed while selected' },
        }
      : node,
  ),
})

const selectedAfter = getFlowRenderSnapshot().flowNodesById[firstNode.id]
if (!selectedAfter?.selected) {
  throw new Error('Hydrating document updates should preserve selected node interaction state.')
}
const selectedEdgeAfter = getFlowRenderSnapshot().flowEdgesById[fixture.edges[0]?.id ?? 'missing']
if (!selectedEdgeAfter?.selected) {
  throw new Error('Hydrating document updates should preserve selected edge interaction state.')
}

console.log('flow render store checks passed')

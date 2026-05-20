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
    localFrameNodeIds: [],
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

useFlowRenderStore.getState().setLocalFrameNodeIds([firstNode.id])
useFlowRenderStore.getState().applyNodeChanges([
  {
    dragging: true,
    id: firstNode.id,
    position: { x: firstNode.position.x + 90, y: firstNode.position.y + 45 },
    type: 'position',
  },
])
useFlowRenderStore.getState().hydrateFromDocument({
  edges: fixture.edges,
  nodes: fixture.nodes.map((node) =>
    node.id === firstNode.id
      ? {
          ...node,
          position: { x: firstNode.position.x + 500, y: firstNode.position.y + 500 },
        }
      : node,
  ),
})

const locallyMovedAfterHydrate = getFlowRenderSnapshot().flowNodesById[firstNode.id]
if (
  !locallyMovedAfterHydrate ||
  locallyMovedAfterHydrate.position.x !== firstNode.position.x + 90 ||
  locallyMovedAfterHydrate.position.y !== firstNode.position.y + 45
) {
  throw new Error('Hydrating document updates should preserve local in-flight node frames.')
}

useFlowRenderStore.getState().releaseLocalFrameNodeIds([firstNode.id])
useFlowRenderStore.getState().hydrateFromDocument({
  edges: fixture.edges,
  nodes: fixture.nodes.map((node) =>
    node.id === firstNode.id
      ? {
          ...node,
          position: { x: firstNode.position.x + 500, y: firstNode.position.y + 500 },
        }
      : node,
  ),
})

const remoteMovedAfterRelease = getFlowRenderSnapshot().flowNodesById[firstNode.id]
if (
  !remoteMovedAfterRelease ||
  remoteMovedAfterRelease.position.x !== firstNode.position.x + 500 ||
  remoteMovedAfterRelease.position.y !== firstNode.position.y + 500
) {
  throw new Error('Hydrating document updates should reconcile remote frames after local frame release.')
}

console.log('flow render store checks passed')

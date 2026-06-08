import { expect, test } from 'bun:test'

import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { getFlowRenderSnapshot, useFlowRenderStore } from './flow-render-store'

test('flow render store preserves interaction state across document hydration', () => {
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
  expect(firstNode).toBeDefined()
  if (!firstNode) {
    return
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
  expect(selectedBefore?.selected).toBe(true)
  const selectedEdgeBefore = getFlowRenderSnapshot().flowEdgesById[fixture.edges[0]?.id ?? 'missing']
  expect(selectedEdgeBefore?.selected).toBe(true)

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

  expect(getFlowRenderSnapshot().flowNodesById[firstNode.id]?.selected).toBe(true)
  expect(getFlowRenderSnapshot().flowEdgesById[fixture.edges[0]?.id ?? 'missing']?.selected).toBe(true)

  const secondNode = getFlowRenderSnapshot().flowNodes[1]
  expect(secondNode).toBeDefined()
  if (!secondNode) {
    return
  }

  useFlowRenderStore.getState().hydrateFromDocument({
    edges: fixture.edges,
    nodes: fixture.nodes,
    selectedNodeIds: [secondNode.id],
  })

  expect(getFlowRenderSnapshot().flowNodesById[firstNode.id]?.selected).toBeFalsy()
  const secondAfterExternalSelection = getFlowRenderSnapshot().flowNodesById[secondNode.id]
  expect(secondAfterExternalSelection?.selected).toBe(true)
  expect(secondAfterExternalSelection).toBeDefined()
  if (!secondAfterExternalSelection) {
    return
  }

  const measuredNode = {
    ...secondAfterExternalSelection,
    measured: { height: 292, width: 390 },
  } as typeof secondAfterExternalSelection
  useFlowRenderStore.setState((state) => ({
    flowNodes: state.flowNodes.map((node) => (node.id === measuredNode.id ? measuredNode : node)),
    flowNodesById: {
      ...state.flowNodesById,
      [measuredNode.id]: measuredNode,
    },
  }))
  useFlowRenderStore.getState().hydrateFromDocument({
    edges: fixture.edges,
    nodes: fixture.nodes,
    selectedNodeIds: [firstNode.id, secondNode.id],
  })
  const measuredAfterExternalSelection = getFlowRenderSnapshot().flowNodesById[measuredNode.id]
  expect(measuredAfterExternalSelection?.measured).toEqual(measuredNode.measured)
  expect(getFlowRenderSnapshot().selectedNodeIdSet).toEqual(new Set([firstNode.id, secondNode.id]))
  expect(getFlowRenderSnapshot().selectedNodeBounds).toBeDefined()

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
  expect(locallyMovedAfterHydrate?.position).toEqual({ x: firstNode.position.x + 90, y: firstNode.position.y + 45 })

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
  expect(remoteMovedAfterRelease?.position).toEqual({ x: firstNode.position.x + 500, y: firstNode.position.y + 500 })
})

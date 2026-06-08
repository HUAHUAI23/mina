import { expect, test } from 'bun:test'

import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { useFlowRenderStore } from '../render/flow-render-store'
import { useCanvasStore } from './canvas-store'

test('remote snapshots do not overwrite active local drag frames', () => {
  const fixture = createCanvasPerformanceFixture(20)
  const workflowId = 'remote_drag_reconciliation_spec'
  const draggedNode = fixture.nodes[0]!

  useCanvasStore.getState().hydrateFromServer({
    edges: fixture.edges,
    name: 'Remote drag reconciliation',
    nodes: fixture.nodes,
    version: 1,
    workflowId,
  })
  useFlowRenderStore.getState().hydrateFromDocument(fixture)

  expect(useFlowRenderStore.getState().flowNodesById[draggedNode.id]).toBeDefined()

  useFlowRenderStore.getState().setDraggingNodeIds([draggedNode.id])
  useFlowRenderStore.getState().setLocalFrameNodeIds([draggedNode.id])
  useFlowRenderStore.getState().applyNodeChanges([
    {
      dragging: true,
      id: draggedNode.id,
      position: { x: draggedNode.position.x + 120, y: draggedNode.position.y + 80 },
      type: 'position',
    },
  ])

  const renderDuringDrag = useFlowRenderStore.getState().flowNodesById[draggedNode.id]!
  expect(renderDuringDrag.position).toEqual({ x: draggedNode.position.x + 120, y: draggedNode.position.y + 80 })

  useCanvasStore.getState().applyRemoteSnapshot({
    edges: fixture.edges,
    nodes: fixture.nodes.map((node, index) =>
      index === 0
        ? {
            ...node,
            data: { ...node.data, title: 'Remote title while dragging' },
            position: { x: node.position.x + 600, y: node.position.y + 600 },
          }
        : node,
    ),
    version: 2,
    workflowId,
  })
  useFlowRenderStore.getState().hydrateFromDocument({
    edges: useCanvasStore.getState().edges,
    nodes: useCanvasStore.getState().nodes,
  })

  const renderAfterRemoteSnapshot = useFlowRenderStore.getState().flowNodesById[draggedNode.id]!
  expect(renderAfterRemoteSnapshot.position).toEqual(renderDuringDrag.position)

  useFlowRenderStore.getState().setDraggingNodeIds([])
  useFlowRenderStore.getState().releaseLocalFrameNodeIds([draggedNode.id])
  useFlowRenderStore.getState().hydrateFromDocument({
    edges: useCanvasStore.getState().edges,
    nodes: useCanvasStore.getState().nodes,
  })

  const renderAfterDrag = useFlowRenderStore.getState().flowNodesById[draggedNode.id]!
  expect(renderAfterDrag.position).toEqual({ x: draggedNode.position.x + 600, y: draggedNode.position.y + 600 })
})

import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { useFlowRenderStore } from '../render/flow-render-store'
import { useCanvasStore } from './canvas-store'

const fixture = createCanvasPerformanceFixture(20)
const workflowId = 'remote_drag_reconciliation_spec'
const draggedNode = fixture.nodes[0]

if (!draggedNode) {
  throw new Error('Expected fixture to include a draggable node.')
}

useCanvasStore.getState().hydrateFromServer({
  edges: fixture.edges,
  name: 'Remote drag reconciliation',
  nodes: fixture.nodes,
  version: 1,
  workflowId,
})
useFlowRenderStore.getState().hydrateFromDocument(fixture)

const renderBeforeDrag = useFlowRenderStore.getState().flowNodesById[draggedNode.id]
if (!renderBeforeDrag) {
  throw new Error(`Expected render store to include ${draggedNode.id}.`)
}

useFlowRenderStore.getState().setDraggingNodeIds([draggedNode.id])
useFlowRenderStore.getState().applyNodeChanges([
  {
    dragging: true,
    id: draggedNode.id,
    position: { x: draggedNode.position.x + 120, y: draggedNode.position.y + 80 },
    type: 'position',
  },
])

const renderDuringDrag = useFlowRenderStore.getState().flowNodesById[draggedNode.id]
if (
  !renderDuringDrag ||
  renderDuringDrag.position.x !== draggedNode.position.x + 120 ||
  renderDuringDrag.position.y !== draggedNode.position.y + 80
) {
  throw new Error('Render state did not apply local drag frame.')
}

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

const renderAfterRemoteSnapshot = useFlowRenderStore.getState().flowNodesById[draggedNode.id]
if (
  !renderAfterRemoteSnapshot ||
  renderAfterRemoteSnapshot.position.x !== renderDuringDrag.position.x ||
  renderAfterRemoteSnapshot.position.y !== renderDuringDrag.position.y
) {
  throw new Error('Remote snapshot overwrote the active local drag frame.')
}

useFlowRenderStore.getState().setDraggingNodeIds([])
useFlowRenderStore.getState().hydrateFromDocument({
  edges: useCanvasStore.getState().edges,
  nodes: useCanvasStore.getState().nodes,
})

const renderAfterDrag = useFlowRenderStore.getState().flowNodesById[draggedNode.id]
if (
  !renderAfterDrag ||
  renderAfterDrag.position.x !== draggedNode.position.x + 600 ||
  renderAfterDrag.position.y !== draggedNode.position.y + 600
) {
  throw new Error('Render state did not reconcile the remote snapshot after local drag ended.')
}

console.log('remote snapshot drag reconciliation checks passed')

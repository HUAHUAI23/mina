import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { useCanvasStore } from './canvas-store'

const fixture = createCanvasPerformanceFixture(3)
const workflowId = 'hydration_slice_spec'

useCanvasStore.getState().hydrateFromServer({
  edges: fixture.edges,
  name: 'Hydration guard',
  nodes: fixture.nodes,
  version: 1,
  workflowId,
})

useCanvasStore.getState().applyRemoteSnapshot({
  edges: [],
  nodes: [],
  source: 'yjs',
  workflowId,
})

if (useCanvasStore.getState().nodes.length !== fixture.nodes.length) {
  throw new Error('Empty Yjs snapshot should not clear a non-empty canvas store.')
}

useCanvasStore.getState().hydrateFromServer({
  edges: [],
  name: 'Hydration metadata only',
  nodes: [],
  version: 2,
  workflowId,
})

const afterSameWorkflowHydrate = useCanvasStore.getState()
if (
  afterSameWorkflowHydrate.name !== 'Hydration metadata only' ||
  afterSameWorkflowHydrate.version !== 2 ||
  afterSameWorkflowHydrate.nodes.length !== fixture.nodes.length
) {
  throw new Error('Same-workflow server hydrate should only update metadata.')
}

useCanvasStore.getState().applyRemoteSnapshot({
  allowEmpty: true,
  edges: [],
  nodes: [],
  source: 'yjs',
  workflowId,
})

if (useCanvasStore.getState().nodes.length !== 0) {
  throw new Error('Synced empty Yjs snapshot should be allowed to clear the canvas store.')
}

console.log('workflow canvas hydration guard checks passed')

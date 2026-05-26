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

useCanvasStore.getState().hydrateFromServer({
  edges: fixture.edges,
  name: 'Hydration preserve references',
  nodes: fixture.nodes,
  version: 3,
  workflowId: 'hydration_reference_spec',
})

const referenceBaseline = useCanvasStore.getState()
useCanvasStore.getState().applyRemoteSnapshot({
  edges: fixture.edges.map((edge) => ({ ...edge })),
  nodes: fixture.nodes.map((node, index) => index === 0
    ? { ...node, data: { ...node.data, title: 'Changed title' } }
    : { ...node }),
  source: 'yjs',
  workflowId: 'hydration_reference_spec',
})

const referenceAfterPatch = useCanvasStore.getState()
if (referenceAfterPatch.nodes[1] !== referenceBaseline.nodes[1]) {
  throw new Error('Remote hydration should preserve unchanged node object references by id.')
}
if (referenceAfterPatch.edges !== referenceBaseline.edges) {
  throw new Error('Remote hydration should preserve the edge array when edge content is unchanged.')
}

console.log('workflow canvas hydration guard checks passed')

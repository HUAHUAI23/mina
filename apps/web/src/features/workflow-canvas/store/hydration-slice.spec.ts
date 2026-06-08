import { expect, test } from 'bun:test'

import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { useCanvasStore } from './canvas-store'

const workflowId = 'hydration_slice_spec'

test('empty Yjs snapshots do not clear non-empty canvas state unless explicitly allowed', () => {
  const fixture = createCanvasPerformanceFixture(3)

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

  expect(useCanvasStore.getState().nodes).toHaveLength(fixture.nodes.length)

  useCanvasStore.getState().hydrateFromServer({
    edges: [],
    name: 'Hydration metadata only',
    nodes: [],
    version: 2,
    workflowId,
  })

  expect(useCanvasStore.getState().name).toBe('Hydration metadata only')
  expect(useCanvasStore.getState().version).toBe(2)
  expect(useCanvasStore.getState().nodes).toHaveLength(fixture.nodes.length)

  useCanvasStore.getState().applyRemoteSnapshot({
    allowEmpty: true,
    edges: [],
    nodes: [],
    source: 'yjs',
    workflowId,
  })

  expect(useCanvasStore.getState().nodes).toHaveLength(0)
})

test('remote hydration preserves unchanged node and edge references', () => {
  const fixture = createCanvasPerformanceFixture(3)

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
  expect(referenceAfterPatch.nodes[1]).toBe(referenceBaseline.nodes[1])
  expect(referenceAfterPatch.edges).toBe(referenceBaseline.edges)
})

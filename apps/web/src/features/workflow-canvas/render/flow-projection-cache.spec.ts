import { expect, test } from 'bun:test'

import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { FlowProjectionCache } from './flow-projection-cache'

test('flow projection cache reuses unchanged projections', () => {
  const fixture = createCanvasPerformanceFixture(20)
  const cache = new FlowProjectionCache()
  const first = cache.projectGraph(fixture)
  const second = cache.projectGraph(fixture)

  expect(second.nodes).toBe(first.nodes)
  expect(second.edges).toBe(first.edges)

  const nextNodes = fixture.nodes.map((node, index) =>
    index === 0
      ? {
          ...node,
          data: { ...node.data, title: 'Changed title' },
        }
      : node,
  )
  const third = cache.projectGraph({ edges: fixture.edges, nodes: nextNodes })

  expect(third.nodes).not.toBe(first.nodes)
  expect(third.nodes[1]).toBe(first.nodes[1])
  expect(third.edges).toBe(first.edges)
})

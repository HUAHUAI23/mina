import { expect, test } from 'bun:test'

import { createCanvasPerformanceFixture, measureStableCanvas } from './performance-fixture'
import { stableCanvas } from './react-flow-persistence'

test('performance fixture creates a stable mixed canvas within budget', () => {
  const fixture = createCanvasPerformanceFixture(1_000)
  const elapsedMs = measureStableCanvas(fixture)
  const canvas = stableCanvas(fixture.nodes, fixture.edges)

  expect(canvas.nodes).toHaveLength(1_000)
  expect(canvas.edges).toHaveLength(899)
  expect(elapsedMs).toBeLessThanOrEqual(250)

  for (const node of canvas.nodes) {
    if (node.data.nodeType === 'image_generation') {
      expect(Object.keys(node.data.mediaSlots ?? {}).every((slot) => slot === 'inputImages')).toBe(true)
    }
  }

  expect(canvas.nodes.some((node) => node.data.nodeType === 'video_generation')).toBe(true)
  expect(canvas.nodes.some((node) => node.data.nodeType === 'text')).toBe(true)
})

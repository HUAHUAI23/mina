import { expect, test } from 'bun:test'

import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { flowPerformanceScore, getFlowPerformancePolicy } from './flow-performance-policy'

test('flow performance policy enables culling as graph cost grows', () => {
  const small = createCanvasPerformanceFixture(20)
  const medium = createCanvasPerformanceFixture(100)

  expect(getFlowPerformancePolicy(small).onlyRenderVisibleElements).toBe(false)
  expect(getFlowPerformancePolicy(medium).onlyRenderVisibleElements).toBe(true)
  expect(flowPerformanceScore(medium)).toBeGreaterThan(flowPerformanceScore(small))
})

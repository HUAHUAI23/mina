import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { flowPerformanceScore, getFlowPerformancePolicy } from './flow-performance-policy'

const small = createCanvasPerformanceFixture(20)
const medium = createCanvasPerformanceFixture(100)

if (getFlowPerformancePolicy(small).onlyRenderVisibleElements) {
  throw new Error('Small canvases should avoid visible-element culling overhead.')
}

if (!getFlowPerformancePolicy(medium).onlyRenderVisibleElements) {
  throw new Error('Media-heavy medium canvases should enable visible-element culling.')
}

if (flowPerformanceScore(medium) <= flowPerformanceScore(small)) {
  throw new Error('Canvas performance score should grow with graph size.')
}

console.log('flow performance policy checks passed')

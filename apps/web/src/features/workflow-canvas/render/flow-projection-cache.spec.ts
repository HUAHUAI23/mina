import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { FlowProjectionCache } from './flow-projection-cache'

const fixture = createCanvasPerformanceFixture(20)
const cache = new FlowProjectionCache()
const first = cache.projectGraph(fixture)
const second = cache.projectGraph(fixture)

if (first.nodes !== second.nodes || first.edges !== second.edges) {
  throw new Error('Projection cache did not reuse graph arrays for identical input.')
}

const nextNodes = fixture.nodes.map((node, index) =>
  index === 0
    ? {
        ...node,
        data: { ...node.data, title: 'Changed title' },
      }
    : node,
)
const third = cache.projectGraph({ edges: fixture.edges, nodes: nextNodes })

if (third.nodes === first.nodes) {
  throw new Error('Projection cache reused node array after a node changed.')
}
if (third.nodes[1] !== first.nodes[1]) {
  throw new Error('Projection cache rebuilt an unrelated flow node.')
}
if (third.edges !== first.edges) {
  throw new Error('Projection cache rebuilt unchanged edge array.')
}

console.log('flow projection cache checks passed')

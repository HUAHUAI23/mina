import { createCanvasPerformanceFixture, measureStableCanvas } from './performance-fixture'
import { stableCanvas } from './react-flow-persistence'

const fixture = createCanvasPerformanceFixture(1_000)
const elapsedMs = measureStableCanvas(fixture)
const canvas = stableCanvas(fixture.nodes, fixture.edges)

if (canvas.nodes.length !== 1_000) {
  throw new Error(`Expected 1000 nodes, received ${canvas.nodes.length}.`)
}

if (canvas.edges.length !== 999) {
  throw new Error(`Expected 999 edges, received ${canvas.edges.length}.`)
}

if (elapsedMs > 250) {
  throw new Error(`stableCanvas took ${elapsedMs.toFixed(2)}ms for 1000 nodes.`)
}

for (const node of canvas.nodes) {
  if (node.data.nodeType === 'image_generation') {
    const slotNames = Object.keys(node.data.mediaSlots ?? {})
    if (!slotNames.every((slot) => slot === 'inputImages')) {
      throw new Error(`Image node ${node.id} contains non-inputImages slots: ${slotNames.join(', ')}`)
    }
  }
}

console.log(`stableCanvas 1000-node fixture: ${elapsedMs.toFixed(2)}ms`)

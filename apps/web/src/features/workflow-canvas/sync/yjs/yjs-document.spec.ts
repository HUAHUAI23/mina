import { createCanvasPerformanceFixture } from '../../utils/performance-fixture'
import {
  createWorkflowYDoc,
  exportWorkflowSnapshotFromYjs,
  importWorkflowSnapshotToYjs,
  workflowYjsSnapshotMatches,
} from './yjs-document'

const fixture = createCanvasPerformanceFixture(20)
const y = createWorkflowYDoc()

importWorkflowSnapshotToYjs(y, fixture)

if (!workflowYjsSnapshotMatches(exportWorkflowSnapshotFromYjs(y), fixture)) {
  throw new Error('Yjs snapshot did not match imported workflow fixture.')
}

y.nodeFrames.set('perf_node_0', { position: { x: 99, y: 101 } })

const moved = exportWorkflowSnapshotFromYjs(y).nodes.find((node) => node.id === 'perf_node_0')
if (moved?.position.x !== 99 || moved.position.y !== 101) {
  throw new Error('Yjs node frame did not update exported node position.')
}

y.nodes.set('remote_only_node', {
  ...fixture.nodes[0]!,
  id: 'remote_only_node',
  position: { x: 999, y: 999 },
})
const remoteOnlyNode = exportWorkflowSnapshotFromYjs(y).nodes.find((node) => node.id === 'remote_only_node')
if (!remoteOnlyNode) {
  throw new Error('Yjs export dropped a node that was missing from nodeOrder.')
}

y.nodeOrder.delete(0, y.nodeOrder.length)
const nodesAfterOrderClear = exportWorkflowSnapshotFromYjs(y).nodes
if (nodesAfterOrderClear.length !== y.nodes.size) {
  throw new Error('Yjs export should fall back to nodes map when nodeOrder is empty.')
}

console.log('workflow yjs document checks passed')

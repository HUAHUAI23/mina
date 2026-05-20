import { createCanvasPerformanceFixture } from '../../utils/performance-fixture'
import { useCanvasStore } from '../../store/canvas-store'
import { createWorkflowYDoc, exportWorkflowSnapshotFromYjs, importWorkflowSnapshotToYjs, workflowYjsSnapshotMatches } from './yjs-document'
import { applyWorkflowTransactionToYjs } from './yjs-transactions'

const fixture = createCanvasPerformanceFixture(20)
const y = createWorkflowYDoc()

importWorkflowSnapshotToYjs(y, fixture)

if (!workflowYjsSnapshotMatches(exportWorkflowSnapshotFromYjs(y), fixture)) {
  throw new Error('Yjs snapshot did not match imported workflow fixture.')
}

applyWorkflowTransactionToYjs(y, {
  changes: [{ nodeId: 'perf_node_0', position: { x: 99, y: 101 } }],
  type: 'move_nodes',
})

const moved = exportWorkflowSnapshotFromYjs(y).nodes.find((node) => node.id === 'perf_node_0')
if (moved?.position.x !== 99 || moved.position.y !== 101) {
  throw new Error('Yjs move_nodes transaction did not update node position.')
}

useCanvasStore.setState({
  dirty: false,
  draftRevision: 0,
  edges: fixture.edges,
  lastDocumentTransaction: undefined,
  name: 'Fixture',
  nodeIndexById: Object.fromEntries(fixture.nodes.map((node, index) => [node.id, index])),
  nodes: fixture.nodes,
  savedRevision: 0,
  saving: false,
  version: 1,
  workflowId: 'workflow_yjs_spec',
})
useCanvasStore.getState().commitNodeFrames([
  { nodeId: 'perf_node_1', position: { x: 333, y: 444 } },
])
const storeTransaction = useCanvasStore.getState().lastDocumentTransaction
if (!storeTransaction || storeTransaction.transaction.type !== 'move_nodes') {
  throw new Error('Canvas store did not record a move_nodes document transaction.')
}
const transactionalY = createWorkflowYDoc()
importWorkflowSnapshotToYjs(transactionalY, fixture)
applyWorkflowTransactionToYjs(transactionalY, storeTransaction.transaction)
const transactionMoved = exportWorkflowSnapshotFromYjs(transactionalY).nodes.find((node) => node.id === 'perf_node_1')
if (transactionMoved?.position.x !== 333 || transactionMoved.position.y !== 444) {
  throw new Error('Store document transaction was not reflected in Yjs snapshot.')
}

console.log('workflow yjs document checks passed')

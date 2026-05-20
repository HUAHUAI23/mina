import { createCanvasPerformanceFixture } from '../utils/performance-fixture'
import { useCanvasStore } from './canvas-store'
import { indexNodes } from './store-helpers'

const resetStore = () => {
  const fixture = createCanvasPerformanceFixture(20)
  useCanvasStore.setState({
    dirty: false,
    draftRevision: 0,
    edges: fixture.edges,
    hydratedWorkflowId: 'document_transactions_spec',
    lastDocumentTransaction: undefined,
    name: 'Document Transactions',
    nodeIndexById: indexNodes(fixture.nodes),
    nodes: fixture.nodes,
    remoteUpdatePending: false,
    remoteVersion: undefined,
    savedRevision: 0,
    saving: false,
    version: 1,
    workflowId: 'document_transactions_spec',
  })
  return fixture
}

const assertTransaction = (type: string, revision: number) => {
  const state = useCanvasStore.getState()
  if (!state.dirty || state.draftRevision !== revision) {
    throw new Error(`Expected dirty revision ${revision}, received ${state.draftRevision}.`)
  }
  if (state.lastDocumentTransaction?.revision !== revision) {
    throw new Error(`Expected transaction revision ${revision}.`)
  }
  if (state.lastDocumentTransaction?.transaction.type !== type) {
    throw new Error(`Expected ${type} transaction, received ${state.lastDocumentTransaction?.transaction.type}.`)
  }
}

resetStore()
useCanvasStore.getState().setNodeText('perf_node_9', 'Updated note')
assertTransaction('update_node', 1)

resetStore()
useCanvasStore.getState().addMediaConnection({ sourceId: 'perf_node_0', targetId: 'perf_node_1' })
assertTransaction('connect_media_slot', 1)

const edgeFixture = resetStore()
useCanvasStore.getState().removeGraphEdges([edgeFixture.edges[1]?.id ?? 'missing'])
assertTransaction('replace_snapshot', 1)

resetStore()
useCanvasStore.getState().removeGraphNodes(['perf_node_2'])
assertTransaction('replace_snapshot', 1)

resetStore()
useCanvasStore.getState().commitNodeFrames([
  { nodeId: 'perf_node_3', position: { x: 999, y: 888 } },
])
assertTransaction('move_nodes', 1)

const unchangedRevision = useCanvasStore.getState().draftRevision
useCanvasStore.getState().commitNodeFrames([
  { nodeId: 'perf_node_3', position: { x: 999, y: 888 } },
])
if (useCanvasStore.getState().draftRevision !== unchangedRevision) {
  throw new Error('Unchanged node frame committed a new dirty revision.')
}

console.log('workflow document transaction checks passed')

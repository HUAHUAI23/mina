import * as Y from 'yjs'
import { createCanvasPerformanceFixture } from '../../utils/performance-fixture'
import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import {
  createWorkflowYDoc,
  exportWorkflowSnapshotFromYjs,
  importWorkflowSnapshotToYjs,
  readWorkflowNodeFromYjs,
  writeWorkflowNode,
  workflowYjsSnapshotMatches,
} from './yjs-document'

const fixture = createCanvasPerformanceFixture(20)
const y = createWorkflowYDoc()

importWorkflowSnapshotToYjs(y, fixture)

if (!workflowYjsSnapshotMatches(exportWorkflowSnapshotFromYjs(y), fixture)) {
  throw new Error('Yjs snapshot did not match imported workflow fixture.')
}

if (!(y.nodes.get('perf_node_0') instanceof Y.Map)) {
  throw new Error('Yjs import should store workflow nodes as nested maps.')
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

const importedNode = readWorkflowNodeFromYjs(y.nodes.get('perf_node_0'))
const fixtureNode = fixture.nodes[0]
if (
  importedNode?.data.nodeType === 'image_generation' &&
  fixtureNode?.data.nodeType === 'image_generation' &&
  importedNode.data.config.task?.prompt !== fixtureNode.data.config.task?.prompt
) {
  throw new Error('Nested Yjs node export should preserve task prompt text.')
}

const fallbackNode = readWorkflowNodeFromYjs(y.nodes.get('perf_node_0'))
if (!fallbackNode || !fixtureNode || fallbackNode.position.x !== fixtureNode.position.x || fallbackNode.position.y !== fixtureNode.position.y) {
  throw new Error('Nested Yjs node export should preserve fallback node position without nodeFrames.')
}

const legacyY = createWorkflowYDoc()
const legacyNode = fixture.nodes[1]
if (!isMediaGenerationNode(legacyNode) || legacyNode.data.nodeType !== 'image_generation' || !legacyNode.data.config.task) {
  throw new Error('Yjs legacy migration fixture should use an image-generation node.')
}
const legacyNext = structuredClone(legacyNode)
legacyNext.data.config.task = {
  ...legacyNode.data.config.task,
  prompt: 'Patched legacy JSON node',
}
legacyY.nodes.set(legacyNode.id, structuredClone(legacyNode))
writeWorkflowNode(legacyY.nodes, legacyNext)
const legacyPatched = readWorkflowNodeFromYjs(legacyY.nodes.get(legacyNode.id))
if (
  !legacyPatched ||
  !(legacyY.nodes.get(legacyNode.id) instanceof Y.Map) ||
  legacyPatched.type !== legacyNode.type ||
  legacyPatched.data.title !== legacyNode.data.title ||
  legacyPatched.data.nodeType !== 'image_generation' ||
  legacyPatched.data.config.task?.prompt !== 'Patched legacy JSON node'
) {
  throw new Error('Writing a legacy JSON node should migrate it to a complete nested Y.Map node.')
}

const invariantY = createWorkflowYDoc()
const invariantNode = fixture.nodes[2]
if (!isMediaGenerationNode(invariantNode) || invariantNode.data.nodeType !== 'image_generation' || !invariantNode.data.config.task) {
  throw new Error('Yjs invariant fixture should use an image-generation node.')
}
const invariantTask = invariantNode.data.config.task
writeWorkflowNode(invariantY.nodes, invariantNode)
invariantY.nodeOrder.push([invariantNode.id])
const invariantRoundTrip = exportWorkflowSnapshotFromYjs(invariantY).nodes[0]
if (
  !invariantRoundTrip ||
  invariantRoundTrip.type !== invariantNode.type ||
  invariantRoundTrip.data.title !== invariantNode.data.title ||
  invariantRoundTrip.data.nodeType !== invariantNode.data.nodeType
) {
  throw new Error('writeWorkflowNode should round-trip node identity fields.')
}

const rewrittenNode = structuredClone(invariantNode)
rewrittenNode.data.title = 'Identity fields survive rewrites'
writeWorkflowNode(invariantY.nodes, rewrittenNode)
const promptNode = structuredClone(rewrittenNode)
promptNode.data.config.task = {
  ...invariantTask,
  prompt: 'Prompt rewritten through Y.Text',
}
writeWorkflowNode(invariantY.nodes, promptNode)
const storedNode = invariantY.nodes.get(invariantNode.id)
if (!(storedNode instanceof Y.Map)) {
  throw new Error('writeWorkflowNode should store nodes as Y.Map entries.')
}
if (storedNode.get('id') !== invariantNode.id || storedNode.get('type') !== invariantNode.type) {
  throw new Error('writeWorkflowNode should keep top-level identity fields across rewrites.')
}
const storedData = storedNode.get('data')
if (!(storedData instanceof Y.Map)) {
  throw new Error('writeWorkflowNode should store node data as a Y.Map.')
}
if (storedData.get('nodeType') !== invariantNode.data.nodeType || storedData.get('title') !== 'Identity fields survive rewrites') {
  throw new Error('writeWorkflowNode should keep data identity fields across rewrites.')
}
const storedConfig = storedData.get('config')
const storedTask = storedConfig instanceof Y.Map ? storedConfig.get('task') : undefined
const storedPrompt = storedTask instanceof Y.Map ? storedTask.get('prompt') : undefined
if (!(storedPrompt instanceof Y.Text) || storedPrompt.toString() !== 'Prompt rewritten through Y.Text') {
  throw new Error('writeWorkflowNode should preserve prompt as Y.Text across rewrites.')
}

const corruptY = createWorkflowYDoc()
const corruptNode = new Y.Map<unknown>()
corruptNode.set('id', 'corrupt_node')
corruptY.nodes.set('corrupt_node', corruptNode)
let corruptNodeThrew = false
try {
  readWorkflowNodeFromYjs(corruptNode)
} catch {
  corruptNodeThrew = true
}
if (!corruptNodeThrew) {
  throw new Error('readWorkflowNodeFromYjs should throw on corrupt nested Y.Map nodes in development.')
}

y.nodeOrder.delete(0, y.nodeOrder.length)
const nodesAfterOrderClear = exportWorkflowSnapshotFromYjs(y).nodes
if (nodesAfterOrderClear.length !== y.nodes.size) {
  throw new Error('Yjs export should fall back to nodes map when nodeOrder is empty.')
}

console.log('workflow yjs document checks passed')

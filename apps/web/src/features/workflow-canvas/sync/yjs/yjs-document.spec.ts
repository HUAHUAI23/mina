import { expect, test } from 'bun:test'
import * as Y from 'yjs'

import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import { createCanvasPerformanceFixture } from '../../utils/performance-fixture'
import {
  createWorkflowYDoc,
  exportWorkflowSnapshotFromYjs,
  importWorkflowSnapshotToYjs,
  readWorkflowNodeFromYjs,
  workflowYjsSnapshotMatches,
  writeWorkflowNode,
} from './yjs-document'

test('workflow yjs document imports workflow snapshots into nested maps', () => {
  const fixture = createCanvasPerformanceFixture(20)
  const y = createWorkflowYDoc()

  importWorkflowSnapshotToYjs(y, fixture)

  expect(workflowYjsSnapshotMatches(exportWorkflowSnapshotFromYjs(y), fixture)).toBe(true)
  expect(y.nodes.get('perf_node_0') instanceof Y.Map).toBe(true)
})

test('workflow yjs document exports frame overrides and normalizes parent extent', () => {
  const fixture = createCanvasPerformanceFixture(20)
  const y = createWorkflowYDoc()

  importWorkflowSnapshotToYjs(y, fixture)
  y.nodeFrames.set('perf_node_0', { position: { x: 99, y: 101 } })

  const moved = exportWorkflowSnapshotFromYjs(y).nodes.find((node) => node.id === 'perf_node_0')
  expect(moved?.position).toEqual({ x: 99, y: 101 })

  const legacyExtentNode = {
    ...fixture.nodes[1]!,
    extent: 'parent' as const,
    id: 'legacy_extent_node',
    parentId: 'legacy_group',
  }
  y.nodes.set('legacy_extent_node', structuredClone(legacyExtentNode))
  y.nodeFrames.set('legacy_extent_node', {
    parentId: 'legacy_group',
    position: { x: 12, y: 34 },
    width: legacyExtentNode.width,
  })

  const legacyExtentExport = exportWorkflowSnapshotFromYjs(y).nodes.find((node) => node.id === 'legacy_extent_node')
  expect(legacyExtentExport?.parentId).toBe('legacy_group')
  expect(legacyExtentExport?.extent).toBe('parent')
})

test('workflow yjs export keeps remote-only nodes and nested text content', () => {
  const fixture = createCanvasPerformanceFixture(20)
  const y = createWorkflowYDoc()

  importWorkflowSnapshotToYjs(y, fixture)
  y.nodes.set('remote_only_node', {
    ...fixture.nodes[0]!,
    id: 'remote_only_node',
    position: { x: 999, y: 999 },
  })

  const exported = exportWorkflowSnapshotFromYjs(y)
  expect(exported.nodes.some((node) => node.id === 'remote_only_node')).toBe(true)

  const importedNode = readWorkflowNodeFromYjs(y.nodes.get('perf_node_0'))
  const fixtureNode = fixture.nodes[0]
  if (importedNode?.data.nodeType === 'image_generation' && fixtureNode?.data.nodeType === 'image_generation') {
    expect(importedNode.data.config.task?.prompt).toBe(fixtureNode.data.config.task?.prompt)
  }

  const fallbackNode = readWorkflowNodeFromYjs(y.nodes.get('perf_node_0'))
  expect(fallbackNode?.position).toEqual(fixtureNode?.position)
})

test('writeWorkflowNode migrates legacy JSON nodes into complete nested Y.Map nodes', () => {
  const fixture = createCanvasPerformanceFixture(20)
  const legacyY = createWorkflowYDoc()
  const legacyNode = fixture.nodes[1]

  expect(isMediaGenerationNode(legacyNode)).toBe(true)
  expect(legacyNode?.data.nodeType).toBe('image_generation')
  if (!isMediaGenerationNode(legacyNode) || legacyNode.data.nodeType !== 'image_generation' || !legacyNode.data.config.task) {
    throw new Error('Invalid test fixture.')
  }

  const legacyNext = structuredClone(legacyNode)
  legacyNext.data.config.task = {
    ...legacyNode.data.config.task,
    prompt: 'Patched legacy JSON node',
  }
  legacyY.nodes.set(legacyNode.id, structuredClone(legacyNode))
  writeWorkflowNode(legacyY.nodes, legacyNext)

  const legacyPatched = readWorkflowNodeFromYjs(legacyY.nodes.get(legacyNode.id))
  expect(legacyY.nodes.get(legacyNode.id) instanceof Y.Map).toBe(true)
  expect(legacyPatched?.type).toBe(legacyNode.type)
  expect(legacyPatched?.data.title).toBe(legacyNode.data.title)
  expect(legacyPatched?.data.nodeType).toBe('image_generation')
  if (legacyPatched?.data.nodeType === 'image_generation') {
    expect(legacyPatched.data.config.task?.prompt).toBe('Patched legacy JSON node')
  }
})

test('writeWorkflowNode preserves identity fields and prompt Y.Text across rewrites', () => {
  const fixture = createCanvasPerformanceFixture(20)
  const invariantY = createWorkflowYDoc()
  const invariantNode = fixture.nodes[2]

  expect(isMediaGenerationNode(invariantNode)).toBe(true)
  expect(invariantNode?.data.nodeType).toBe('image_generation')
  if (!isMediaGenerationNode(invariantNode) || invariantNode.data.nodeType !== 'image_generation' || !invariantNode.data.config.task) {
    throw new Error('Invalid test fixture.')
  }

  const invariantTask = invariantNode.data.config.task
  writeWorkflowNode(invariantY.nodes, invariantNode)
  invariantY.nodeOrder.push([invariantNode.id])

  const invariantRoundTrip = exportWorkflowSnapshotFromYjs(invariantY).nodes[0]
  expect(invariantRoundTrip?.type).toBe(invariantNode.type)
  expect(invariantRoundTrip?.data.title).toBe(invariantNode.data.title)
  expect(invariantRoundTrip?.data.nodeType).toBe(invariantNode.data.nodeType)

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
  expect(storedNode instanceof Y.Map).toBe(true)
  if (!(storedNode instanceof Y.Map)) {
    throw new Error('Invalid stored node.')
  }

  expect(storedNode.get('id')).toBe(invariantNode.id)
  expect(storedNode.get('type')).toBe(invariantNode.type)

  const storedData = storedNode.get('data')
  expect(storedData instanceof Y.Map).toBe(true)
  if (!(storedData instanceof Y.Map)) {
    throw new Error('Invalid stored node data.')
  }

  expect(storedData.get('nodeType')).toBe(invariantNode.data.nodeType)
  expect(storedData.get('title')).toBe('Identity fields survive rewrites')

  const storedConfig = storedData.get('config')
  const storedTask = storedConfig instanceof Y.Map ? storedConfig.get('task') : undefined
  const storedPrompt = storedTask instanceof Y.Map ? storedTask.get('prompt') : undefined
  expect(storedPrompt instanceof Y.Text).toBe(true)
  expect(storedPrompt instanceof Y.Text ? storedPrompt.toString() : undefined).toBe('Prompt rewritten through Y.Text')
})

test('workflow yjs document rejects corrupt nested nodes and falls back when node order is empty', () => {
  const fixture = createCanvasPerformanceFixture(20)
  const y = createWorkflowYDoc()
  const corruptY = createWorkflowYDoc()
  const corruptNode = new Y.Map<unknown>()

  corruptNode.set('id', 'corrupt_node')
  corruptY.nodes.set('corrupt_node', corruptNode)
  expect(() => readWorkflowNodeFromYjs(corruptNode)).toThrow()

  importWorkflowSnapshotToYjs(y, fixture)
  y.nodeOrder.delete(0, y.nodeOrder.length)
  expect(exportWorkflowSnapshotFromYjs(y).nodes).toHaveLength(y.nodes.size)
})

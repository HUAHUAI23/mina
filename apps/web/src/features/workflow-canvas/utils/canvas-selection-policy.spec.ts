import { expect, test } from 'bun:test'
import type { WorkflowFlowNode } from '../domain/flow-types'
import {
  createFlowSelectionRect,
  getSelectedFlowNodesBounds,
  resolveNodeIdsInFlowSelectionRect,
} from './canvas-selection-policy'

const nodes = [
  {
    data: { nodeId: 'root', nodeType: 'text', textPreview: '', title: 'Root' },
    id: 'root',
    position: { x: 40, y: 40 },
    type: 'text',
    width: 220,
  },
  {
    data: { nodeId: 'group', nodeType: 'node_group', title: 'Group' },
    height: 320,
    id: 'group',
    position: { x: 300, y: 300 },
    type: 'node_group',
    width: 520,
  },
  {
    data: { nodeId: 'child', nodeType: 'text', textPreview: '', title: 'Child' },
    id: 'child',
    parentId: 'group',
    position: { x: 50, y: 60 },
    type: 'text',
    width: 220,
  },
] satisfies WorkflowFlowNode[]

test('selection rect respects root and group scopes', () => {
  const wideRect = createFlowSelectionRect({ x: 0, y: 0 }, { x: 900, y: 900 })

  const rootSelection = resolveNodeIdsInFlowSelectionRect(nodes, { scope: 'root' }, wideRect)
  expect(rootSelection).not.toContain('child')
  expect(rootSelection).toContain('root')
  expect(rootSelection).toContain('group')

  const groupSelection = resolveNodeIdsInFlowSelectionRect(
    nodes,
    { scope: 'node_group', scopeNodeId: 'group' },
    wideRect,
  )
  expect(groupSelection).toEqual(['child'])
})

test('selection bounds use visual frames and skip parent child mixed selections', () => {
  const staleMediaWidthBounds = getSelectedFlowNodesBounds([
    {
      data: { mediaView: undefined, nodeId: 'image_a', nodeType: 'image_generation', title: 'Image A' },
      id: 'image_a',
      position: { x: 0, y: 0 },
      type: 'image_generation',
      width: 240,
    },
    {
      data: { mediaView: undefined, nodeId: 'image_b', nodeType: 'image_generation', title: 'Image B' },
      id: 'image_b',
      position: { x: 460, y: 0 },
      type: 'image_generation',
      width: 240,
    },
  ] satisfies WorkflowFlowNode[], ['image_a', 'image_b'])
  expect(staleMediaWidthBounds?.right).toBe(850)
  expect(getSelectedFlowNodesBounds(nodes, ['group', 'child'])).toBeUndefined()
})

import { expect, test } from 'bun:test'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { toFlowNode } from './flow-adapters'

const childNode: WorkflowCanvasNode = {
  data: {
    config: {},
    mediaSlots: {},
    nodeType: 'image_generation',
    title: 'Legacy child',
  },
  extent: 'parent',
  id: 'child',
  parentId: 'group',
  position: { x: 24, y: 48 },
  type: 'image_generation',
  width: 240,
}

test('flow projection preserves group membership and normalizes visual frame size', () => {
  const projected = toFlowNode(childNode)

  expect(projected.parentId).toBe('group')
  expect(projected.extent).toBe('parent')
  expect(projected.expandParent).toBe(true)
  expect(projected.width).toBe(390)
  expect(projected.height).toBe(292)
})

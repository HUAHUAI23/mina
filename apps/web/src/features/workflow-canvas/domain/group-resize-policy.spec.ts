import { expect, test } from 'bun:test'
import type { ResizeParamsWithDirection } from '@xyflow/react'

import type { WorkflowFlowNode } from './flow-types'
import { canResizeWorkflowGroup } from './group-resize-policy'

const groupNode = {
  data: { nodeId: 'group', nodeType: 'node_group', title: 'Group' },
  height: 320,
  id: 'group',
  position: { x: 300, y: 200 },
  type: 'node_group',
  width: 520,
} satisfies WorkflowFlowNode

const childNode = {
  data: { nodeId: 'child', nodeType: 'text', textPreview: '', title: 'Child' },
  height: 128,
  id: 'child',
  parentId: 'group',
  position: { x: 120, y: 96 },
  type: 'text',
  width: 224,
} satisfies WorkflowFlowNode

const resizeParams = (input: {
  height?: number
  width?: number
  x?: number
  y?: number
}): ResizeParamsWithDirection => ({
  direction: [0, 0],
  height: input.height ?? groupNode.height,
  width: input.width ?? groupNode.width,
  x: input.x ?? groupNode.position.x,
  y: input.y ?? groupNode.position.y,
})

const canResize = (params: ResizeParamsWithDirection): boolean =>
  canResizeWorkflowGroup({
    childNodes: [childNode],
    groupNode,
    minHeight: 180,
    minWidth: 280,
    params,
  })

test('group resize policy keeps children inside group bounds', () => {
  expect(canResize(resizeParams({ width: 440, x: 380 }))).toBe(true)
  expect(canResize(resizeParams({ width: 390, x: 430 }))).toBe(false)
  expect(canResize(resizeParams({ height: 280, y: 240 }))).toBe(true)
  expect(canResize(resizeParams({ height: 270, y: 250 }))).toBe(false)
  expect(canResize(resizeParams({ width: 360 }))).toBe(false)
})

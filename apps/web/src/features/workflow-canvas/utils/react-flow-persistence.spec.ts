import { expect, test } from 'bun:test'

import { stableCanvas } from './react-flow-persistence'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

const transientNode = {
  id: 'node_with_transient_fields',
  type: 'image_generation',
  position: { x: 10, y: 20 },
  width: 240,
  selected: true,
  dragging: true,
  measured: { width: 999, height: 999 },
  positionAbsolute: { x: 999, y: 999 },
  data: {
    nodeType: 'image_generation',
    title: 'Transient node',
    config: {
      task: {
        kind: 'image_generation',
        provider: 'google',
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'Prompt',
        params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
      },
    },
    mediaSlots: {
      inputImages: [
        {
          id: 'slot_input',
          order: 0,
          required: true,
          slot: 'inputImages',
          source: { type: 'media_object', mediaObjectId: 'media_1' },
        },
      ],
      referenceImages: [
        {
          id: 'slot_reference',
          order: 1,
          required: false,
          slot: 'referenceImages',
          source: { type: 'media_object', mediaObjectId: 'media_2' },
        },
      ],
    },
  },
} as unknown as WorkflowCanvasNode

test('stableCanvas strips React Flow transient fields and preserves serializable node data', () => {
  const canvas = stableCanvas([transientNode], [])
  const serialized = JSON.stringify(canvas)

  for (const transientKey of ['selected', 'dragging', 'measured', 'positionAbsolute']) {
    expect(serialized).not.toContain(transientKey)
  }

  const node = canvas.nodes[0]!
  expect(node.position).toEqual({ x: 10, y: 20 })
  expect(node.width).toBe(240)
  expect(node.data.nodeType).toBe('image_generation')
  if (node.data.nodeType !== 'image_generation') {
    throw new Error('Expected image generation node.')
  }
  expect(Object.keys(node.data.mediaSlots ?? {})).toEqual(['inputImages'])
})

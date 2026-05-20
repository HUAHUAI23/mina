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
        provider: 'dev',
        model: 'dev-image',
        prompt: 'Prompt',
        params: { count: 1, size: '1024x1024' },
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

const canvas = stableCanvas([transientNode], [])
const serialized = JSON.stringify(canvas)

for (const transientKey of ['selected', 'dragging', 'measured', 'positionAbsolute']) {
  if (serialized.includes(transientKey)) {
    throw new Error(`stableCanvas serialized React Flow transient key: ${transientKey}`)
  }
}

const node = canvas.nodes[0]
if (!node || node.position.x !== 10 || node.position.y !== 20 || node.width !== 240) {
  throw new Error('stableCanvas did not preserve stable node frame fields.')
}

if (node.data.nodeType !== 'image_generation') {
  throw new Error('Expected image generation node.')
}

const slotNames = Object.keys(node.data.mediaSlots ?? {})
if (slotNames.length !== 1 || slotNames[0] !== 'inputImages') {
  throw new Error(`Expected only inputImages media slot in image save payload, received ${slotNames.join(', ')}`)
}

console.log('react-flow persistence serialization checks passed')

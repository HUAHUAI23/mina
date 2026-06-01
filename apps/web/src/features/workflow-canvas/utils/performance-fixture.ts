import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { MEDIA_GENERATION_NODE_FRAME } from '../domain/canvas-node-types'
import { stableCanvas } from './react-flow-persistence'

export interface CanvasPerformanceFixture {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
}

const FIXTURE_COLUMN_WIDTH = 470
const FIXTURE_ROW_HEIGHT = 320
const FIXTURE_COLUMNS = 40

const imageNode = (index: number): WorkflowCanvasNode => ({
  id: `perf_node_${index}`,
  type: 'image_generation',
  position: {
    x: (index % FIXTURE_COLUMNS) * FIXTURE_COLUMN_WIDTH,
    y: Math.floor(index / FIXTURE_COLUMNS) * FIXTURE_ROW_HEIGHT,
  },
  width: MEDIA_GENERATION_NODE_FRAME.width,
  data: {
    nodeType: 'image_generation',
    title: `Image ${index}`,
    config: {
      task: {
        kind: 'image_generation',
        provider: 'google',
        model: 'gemini-3.1-flash-image-preview',
        prompt: `Prompt ${index}`,
        params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
      },
    },
    mediaSlots:
      index > 0
        ? {
            inputImages: [
              {
                id: `perf_slot_${index}`,
                order: 0,
                required: true,
                slot: 'inputImages',
                source: { type: 'node_output', nodeId: `perf_node_${index - 1}`, resolve: 'current_media' },
              },
            ],
          }
        : {},
  },
})

const videoNode = (index: number): WorkflowCanvasNode => ({
  id: `perf_node_${index}`,
  type: 'video_generation',
  position: {
    x: (index % FIXTURE_COLUMNS) * FIXTURE_COLUMN_WIDTH,
    y: Math.floor(index / FIXTURE_COLUMNS) * FIXTURE_ROW_HEIGHT,
  },
  width: MEDIA_GENERATION_NODE_FRAME.width,
  data: {
    nodeType: 'video_generation',
    title: `Video ${index}`,
    config: {
      task: {
        kind: 'video_generation',
        provider: 'google',
        model: 'veo-3.1-generate-preview',
        prompt: `Motion ${index}`,
        params: { aspectRatio: '16:9', durationSeconds: 8, personGeneration: 'allow_all', resolution: '720p' },
      },
    },
    mediaSlots:
      index > 0
        ? {
            firstFrame: [
              {
                id: `perf_slot_${index}`,
                order: 0,
                required: true,
                slot: 'firstFrame',
                source: { type: 'node_output', nodeId: `perf_node_${index - 1}`, resolve: 'current_media' },
              },
            ],
          }
        : {},
  },
})

const textNode = (index: number): WorkflowCanvasNode => ({
  id: `perf_node_${index}`,
  type: 'text',
  position: {
    x: (index % FIXTURE_COLUMNS) * FIXTURE_COLUMN_WIDTH,
    y: Math.floor(index / FIXTURE_COLUMNS) * FIXTURE_ROW_HEIGHT,
  },
  width: 220,
  data: {
    nodeType: 'text',
    title: `Text ${index}`,
    config: { text: `Note ${index}` },
  },
})

const fixtureNode = (index: number): WorkflowCanvasNode => {
  if (index % 10 === 9) {
    return textNode(index)
  }
  if (index % 5 === 4) {
    return videoNode(index)
  }
  return imageNode(index)
}

const mediaEdge = (index: number): WorkflowCanvasEdge => ({
  id: `perf_edge_${index}`,
  type: 'media',
  source: `perf_node_${index - 1}`,
  target: `perf_node_${index}`,
  data: {
    connection: {
      kind: 'media_link',
      targetSlot: index % 5 === 4 ? 'firstFrame' : 'inputImages',
      targetSlotItemId: `perf_slot_${index}`,
    },
  },
})

export const createCanvasPerformanceFixture = (nodeCount: number): CanvasPerformanceFixture => {
  const nodes = Array.from({ length: nodeCount }, (_unused, index) => fixtureNode(index))
  const edges = Array.from({ length: Math.max(0, nodeCount - 1) }, (_unused, index) => index + 1)
    .filter((index) => index % 10 !== 9)
    .map(mediaEdge)
  return { nodes, edges }
}

export const measureStableCanvas = (fixture: CanvasPerformanceFixture): number => {
  const startedAt = performance.now()
  stableCanvas(fixture.nodes, fixture.edges)
  return performance.now() - startedAt
}

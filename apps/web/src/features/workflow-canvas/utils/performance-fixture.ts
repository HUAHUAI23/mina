import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { stableCanvas } from './react-flow-persistence'

export interface CanvasPerformanceFixture {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
}

const imageNode = (index: number): WorkflowCanvasNode => ({
  id: `perf_node_${index}`,
  type: 'image_generation',
  position: {
    x: (index % 40) * 320,
    y: Math.floor(index / 40) * 260,
  },
  width: 240,
  data: {
    nodeType: 'image_generation',
    title: `Image ${index}`,
    config: {
      task: {
        kind: 'image_generation',
        provider: 'dev',
        model: 'dev-image',
        prompt: `Prompt ${index}`,
        params: { count: 1, size: '1024x1024' },
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

const mediaEdge = (index: number): WorkflowCanvasEdge => ({
  id: `perf_edge_${index}`,
  type: 'media',
  source: `perf_node_${index - 1}`,
  target: `perf_node_${index}`,
  data: {
    connection: {
      kind: 'media_link',
      targetSlot: 'inputImages',
      targetSlotItemId: `perf_slot_${index}`,
    },
  },
})

export const createCanvasPerformanceFixture = (nodeCount: number): CanvasPerformanceFixture => {
  const nodes = Array.from({ length: nodeCount }, (_unused, index) => imageNode(index))
  const edges = Array.from({ length: Math.max(0, nodeCount - 1) }, (_unused, index) => mediaEdge(index + 1))
  return { nodes, edges }
}

export const measureStableCanvas = (fixture: CanvasPerformanceFixture): number => {
  const startedAt = performance.now()
  stableCanvas(fixture.nodes, fixture.edges)
  return performance.now() - startedAt
}

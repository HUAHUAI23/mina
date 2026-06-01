import { expect, test } from 'bun:test'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { materializeEffectiveMediaViews } from './materialize-effective-media-views'

const imageNode = (id: string, mediaView?: { taskId?: string; outputIndex?: number }): WorkflowCanvasNode => ({
  id,
  type: 'image_generation',
  position: { x: 0, y: 0 },
  data: {
    nodeType: 'image_generation',
    title: id,
    config: {},
    ...(mediaView ? { mediaView } : {}),
  },
})

test('materializes latest task ids only for unpinned media nodes', () => {
  const unpinned = imageNode('latest')
  const pinned = imageNode('pinned', { taskId: 'task_pinned', outputIndex: 1 })
  const partial = imageNode('partial', { outputIndex: 2 })
  const nodes = [unpinned, pinned, partial]

  const materialized = materializeEffectiveMediaViews(nodes, [
    {
      nodeId: 'latest',
      latestTaskId: 'task_latest',
      latestTaskCreatedAt: '2026-05-30T00:00:00.000Z',
      status: 'succeeded',
      statusUpdatedAt: '2026-05-30T00:00:01.000Z',
    },
    {
      nodeId: 'pinned',
      latestTaskId: 'task_newer',
      latestTaskCreatedAt: '2026-05-31T00:00:00.000Z',
      status: 'succeeded',
      statusUpdatedAt: '2026-05-31T00:00:01.000Z',
    },
    {
      nodeId: 'partial',
      latestTaskId: 'task_partial_latest',
      latestTaskCreatedAt: '2026-05-31T01:00:00.000Z',
      status: 'succeeded',
      statusUpdatedAt: '2026-05-31T01:00:01.000Z',
    },
  ])

  expect(materialized[0]?.data.nodeType === 'image_generation' ? materialized[0].data.mediaView?.taskId : undefined).toBe('task_latest')
  expect(materialized[1]?.data.nodeType === 'image_generation' ? materialized[1].data.mediaView?.taskId : undefined).toBe('task_pinned')
  expect(materialized[2]?.data.nodeType === 'image_generation' ? materialized[2].data.mediaView?.taskId : undefined).toBe('task_partial_latest')
  expect(unpinned.data.nodeType === 'image_generation' ? unpinned.data.mediaView?.taskId : undefined).toBeUndefined()
  expect(partial.data.nodeType === 'image_generation' ? partial.data.mediaView?.taskId : undefined).toBeUndefined()
})

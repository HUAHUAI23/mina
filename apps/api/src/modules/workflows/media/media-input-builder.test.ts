import { describe, expect, test } from 'bun:test'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { findOutputBySelector } from './media-input-builder'

const resource = (
  id: string,
  role: NodeOutputResource['role'],
  index: number,
): NodeOutputResource => ({
  id,
  index,
  kind: 'image',
  role,
  url: `https://cdn.example/${id}.jpg`,
})

describe('findOutputBySelector', () => {
  test('interprets selector index within the requested role', () => {
    const output: { resources: NodeOutputResource[] } = {
      resources: [
        { ...resource('video-0', 'generated_video', 0), kind: 'video' as const, url: 'https://cdn.example/video.mp4' },
        resource('first-frame-0', 'first_frame', 1),
        resource('last-frame-0', 'last_frame', 2),
        resource('video-cover-0', 'video_cover', 3),
        resource('first-frame-1', 'first_frame', 4),
      ],
    }

    expect(findOutputBySelector(output, 'image', 'first_frame', 0)?.id).toBe('first-frame-0')
    expect(findOutputBySelector(output, 'image', 'first_frame', 1)?.id).toBe('first-frame-1')
    expect(findOutputBySelector(output, 'image', 'last_frame', 0)?.id).toBe('last-frame-0')
    expect(findOutputBySelector(output, 'image', 'video_cover', 0)?.id).toBe('video-cover-0')
  })

  test('returns undefined when the role-local index does not exist', () => {
    const output: { resources: NodeOutputResource[] } = {
      resources: [resource('first-frame-0', 'first_frame', 1)],
    }

    expect(findOutputBySelector(output, 'image', 'first_frame', 1)).toBeUndefined()
  })
})

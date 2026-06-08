import { expect, test } from 'bun:test'
import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

import { videoPosterResource } from './media-view'

const video = (index = 0): NodeOutputResource => ({
  id: `task:video:${index}`,
  index,
  kind: 'video',
  role: 'generated_video',
  url: `https://cdn/video-${index}.mp4`,
})

const frame = (
  role: Extract<NodeOutputResource['role'], 'first_frame' | 'last_frame' | 'video_cover'>,
  index: number,
  metadata?: NodeOutputResource['metadata'],
): NodeOutputResource => ({
  id: `task:${role}:${index}`,
  index,
  kind: 'image',
  metadata,
  role,
  url: `https://cdn/${role}-${index}.jpg`,
})

const output = (resources: NodeOutputResource[]): NodeExecutionOutput => ({
  resources,
  variables: {},
})

test('video poster selection prefers metadata-linked covers', () => {
  const selectedVideo = video()
  const poster = videoPosterResource(output([
    selectedVideo,
    frame('last_frame', 2, { sourceLastFrameVideoResourceId: selectedVideo.id }),
    frame('first_frame', 1, { sourceFirstFrameVideoResourceId: selectedVideo.id }),
    frame('video_cover', 3, { sourceVideoResourceId: selectedVideo.id }),
  ]), selectedVideo)

  expect(poster?.role).toBe('video_cover')
})

test('video poster selection accepts unlinked provider frames for single-video outputs', () => {
  const selectedVideo = video()
  const poster = videoPosterResource(output([
    selectedVideo,
    frame('last_frame', 1),
  ]), selectedVideo)

  expect(poster?.role).toBe('last_frame')
})

test('video poster selection does not assign unlinked frames in multi-video outputs', () => {
  const selectedVideo = video(0)
  const poster = videoPosterResource(output([
    selectedVideo,
    video(1),
    frame('last_frame', 2),
  ]), selectedVideo)

  expect(poster).toBeUndefined()
})

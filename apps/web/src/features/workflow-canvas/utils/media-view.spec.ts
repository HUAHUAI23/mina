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

const assertMetadataLinkedCoverWins = (): void => {
  const selectedVideo = video()
  const poster = videoPosterResource(output([
    selectedVideo,
    frame('last_frame', 2, { sourceLastFrameVideoResourceId: selectedVideo.id }),
    frame('first_frame', 1, { sourceFirstFrameVideoResourceId: selectedVideo.id }),
    frame('video_cover', 3, { sourceVideoResourceId: selectedVideo.id }),
  ]), selectedVideo)

  if (poster?.role !== 'video_cover') {
    throw new Error('Video poster selection should choose metadata-linked cover before first or last frames.')
  }
}

const assertSingleVideoFallback = (): void => {
  const selectedVideo = video()
  const poster = videoPosterResource(output([
    selectedVideo,
    frame('last_frame', 1),
  ]), selectedVideo)

  if (poster?.role !== 'last_frame') {
    throw new Error('Single-video outputs should accept unlinked provider frames as poster fallback.')
  }
}

const assertMultiVideoDoesNotUseUnlinkedFrame = (): void => {
  const selectedVideo = video(0)
  const poster = videoPosterResource(output([
    selectedVideo,
    video(1),
    frame('last_frame', 2),
  ]), selectedVideo)

  if (poster !== undefined) {
    throw new Error('Multi-video outputs should not assign unlinked frames to a selected video.')
  }
}

assertMetadataLinkedCoverWins()
assertSingleVideoFallback()
assertMultiVideoDoesNotUseUnlinkedFrame()

console.log('media-view checks passed')

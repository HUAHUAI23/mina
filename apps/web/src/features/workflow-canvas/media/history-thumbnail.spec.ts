import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

import { historyThumbnailResource } from './history-thumbnail'

const video: NodeOutputResource = {
  id: 'task:video:0',
  index: 0,
  kind: 'video',
  role: 'generated_video',
  url: 'https://cdn/video.mp4',
}

const cover: NodeOutputResource = {
  id: 'task:cover:0',
  index: 1,
  kind: 'image',
  metadata: { sourceVideoResourceId: video.id },
  role: 'video_cover',
  url: 'https://cdn/cover.jpg',
}

const image: NodeOutputResource = {
  id: 'task:image:0',
  index: 0,
  kind: 'image',
  role: 'generated_image',
  url: 'https://cdn/image.jpg',
}

const output: NodeExecutionOutput = {
  resources: [video, cover, image],
  variables: {},
}

if (historyThumbnailResource(output, video) !== cover) {
  throw new Error('History rail video thumbnails should use the selected video poster when available.')
}

if (historyThumbnailResource(output, image) !== image) {
  throw new Error('History rail image thumbnails should use the image output itself.')
}

console.log('history-thumbnail checks passed')

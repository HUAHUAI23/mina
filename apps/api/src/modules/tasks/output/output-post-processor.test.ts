import { describe, expect, test } from 'bun:test'
import type { Task } from '@mina/contracts/modules/tasks'

import { OutputPostProcessor } from './output-post-processor'
import type { VideoCoverGenerator } from './video-cover-generator'

const videoTask = (): Task => ({
  id: 'task_video',
  accountId: 'account',
  kind: 'video_generation',
  mode: 'async',
  provider: 'dev',
  model: 'dev-video',
  status: 'running',
  config: {
    kind: 'video_generation',
    provider: 'dev',
    model: 'dev-video',
    prompt: 'video',
    media: {
      inputImages: [],
      referenceImages: [],
      referenceAudios: [],
      referenceVideos: [],
    },
    params: {},
  },
  cost: {
    estimatedCost: 1,
    usage: {
      amount: 1,
      metric: 'duration_second',
    },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

describe('OutputPostProcessor', () => {
  test('adds video_cover and videoCoverUrls for video outputs', async () => {
    const generator: VideoCoverGenerator = {
      generateCover: async ({ taskId, video }) => ({
        id: `${taskId}:video-cover:0`,
        kind: 'image',
        role: 'video_cover',
        index: 1,
        url: `${video.url}.jpg`,
        metadata: {
          frameTimeSeconds: 0,
          sourceVideoResourceId: video.id,
        },
      }),
    }
    const processed = await new OutputPostProcessor(generator).process(videoTask(), {
      resources: [{ id: 'task_video:video:0', kind: 'video', role: 'generated_video', index: 0, url: 'https://cdn/video.mp4' }],
      variables: {},
    })

    expect(processed.resources.map((resource) => resource.role)).toEqual(['generated_video', 'video_cover'])
    expect(processed.variables.videoCoverUrls).toEqual(['https://cdn/video.mp4.jpg'])
  })

  test('reuses provider-returned video_cover and keeps last_frame separate', async () => {
    let generated = false
    const generator: VideoCoverGenerator = {
      generateCover: async () => {
        generated = true
        throw new Error('should not run')
      },
    }
    const processed = await new OutputPostProcessor(generator).process(videoTask(), {
      resources: [
        { id: 'task_video:video:0', kind: 'video', role: 'generated_video', index: 0, url: 'https://cdn/video.mp4' },
        {
          id: 'task_video:video-cover:0',
          kind: 'image',
          role: 'video_cover',
          index: 1,
          url: 'https://cdn/cover.jpg',
          metadata: { sourceVideoResourceId: 'task_video:video:0' },
        },
        { id: 'task_video:last-frame:0', kind: 'image', role: 'last_frame', index: 2, url: 'https://cdn/last.jpg' },
      ],
      variables: {},
    })

    expect(generated).toBe(false)
    expect(processed.variables.videoCoverUrls).toEqual(['https://cdn/cover.jpg'])
    expect(processed.variables.lastFrameUrls).toEqual(['https://cdn/last.jpg'])
  })

  test('propagates cover generation failures', async () => {
    const generator: VideoCoverGenerator = {
      generateCover: async () => {
        throw new Error('cover failed')
      },
    }

    await expect(
      new OutputPostProcessor(generator).process(videoTask(), {
        resources: [{ id: 'task_video:video:0', kind: 'video', role: 'generated_video', index: 0, url: 'https://cdn/video.mp4' }],
        variables: {},
      }),
    ).rejects.toThrow('cover failed')
  })
})

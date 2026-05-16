import { describe, expect, test } from 'bun:test'
import type { Task } from '@mina/contracts/modules/tasks'

import { OutputPostProcessor } from './output-post-processor'
import type { VideoFrameGenerator } from './video-frame-generator'

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
  test('adds first frame, last frame, cover, and variables for video outputs', async () => {
    const task = videoTask()
    const generator: VideoFrameGenerator = {
      generateFrame: async ({ frameRole, taskId, video }) => ({
        id: `${taskId}:${frameRole}:0`,
        kind: 'image',
        role: frameRole,
        index: frameRole === 'first_frame' ? 1 : frameRole === 'last_frame' ? 2 : 3,
        url: `${video.url}.${frameRole}.jpg`,
        metadata: {
          frameRole,
          frameTimeSeconds: 0,
          sourceVideoResourceId: video.id,
        },
      }),
    }
    const processed = await new OutputPostProcessor(generator).process(task, {
      resources: [{ id: 'task_video:video:0', kind: 'video', role: 'generated_video', index: 0, url: 'https://cdn/video.mp4' }],
      variables: {},
    })

    expect(processed.resources.map((resource) => resource.role)).toEqual([
      'generated_video',
      'first_frame',
      'last_frame',
      'video_cover',
    ])
    expect(processed.variables.firstFrameUrls).toEqual(['https://cdn/video.mp4.first_frame.jpg'])
    expect(processed.variables.lastFrameUrls).toEqual(['https://cdn/video.mp4.last_frame.jpg'])
    expect(processed.variables.videoCoverUrls).toEqual(['https://cdn/video.mp4.video_cover.jpg'])
  })

  test('reuses provider-returned frames and only generates missing roles', async () => {
    const generatedRoles: string[] = []
    const generator: VideoFrameGenerator = {
      generateFrame: async ({ frameRole, taskId, video }) => {
        generatedRoles.push(frameRole)
        return {
          id: `${taskId}:${frameRole}:generated`,
          kind: 'image',
          role: frameRole,
          index: 3,
          url: `${video.url}.${frameRole}.jpg`,
          metadata: { sourceVideoResourceId: video.id },
        }
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
        {
          id: 'task_video:first-frame:0',
          kind: 'image',
          role: 'first_frame',
          index: 2,
          url: 'https://cdn/first.jpg',
          metadata: { sourceFirstFrameVideoResourceId: 'task_video:video:0' },
        },
        { id: 'task_video:last-frame:0', kind: 'image', role: 'last_frame', index: 2, url: 'https://cdn/last.jpg' },
      ],
      variables: {},
    })

    expect(generatedRoles).toEqual([])
    expect(processed.variables.firstFrameUrls).toEqual(['https://cdn/first.jpg'])
    expect(processed.variables.videoCoverUrls).toEqual(['https://cdn/cover.jpg'])
    expect(processed.variables.lastFrameUrls).toEqual(['https://cdn/last.jpg'])
  })

  test('propagates frame generation failures', async () => {
    const generator: VideoFrameGenerator = {
      generateFrame: async () => {
        throw new Error('frame failed')
      },
    }

    await expect(
      new OutputPostProcessor(generator).process(videoTask(), {
        resources: [{ id: 'task_video:video:0', kind: 'video', role: 'generated_video', index: 0, url: 'https://cdn/video.mp4' }],
        variables: {},
      }),
    ).rejects.toThrow('frame failed')
  })
})

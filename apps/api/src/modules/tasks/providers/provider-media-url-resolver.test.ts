import { describe, expect, test } from 'bun:test'
import type { MediaInput, Task } from '@mina/contracts/modules/tasks'

import {
  FakeObjectStorage,
} from '../../../test/doubles'
import { buildReadyMediaObject } from '../../../test/builders/media-object-builder'
import { createMediaObjectTestScenario } from '../../../test/scenarios/media-object-scenario'
import type { CreatePresignedGetUrlInput } from '../../../lib/storage/object-storage'
import { ProviderMediaUrlResolver } from './provider-media-url-resolver'

class CountingObjectStorage extends FakeObjectStorage {
  readonly getUrlCalls: CreatePresignedGetUrlInput[] = []

  override async createPresignedGetUrl(input: CreatePresignedGetUrlInput): Promise<string> {
    this.getUrlCalls.push(input)
    return `https://signed.example/${encodeURIComponent(input.key)}?expires=${input.expiresInSeconds}`
  }
}

const now = new Date('2026-01-01T00:00:00.000Z').toISOString()

const mediaInput = (
  role: MediaInput['role'],
  mediaObjectId: string,
  overrides: Partial<MediaInput> = {},
): MediaInput => ({
  kind: role === 'reference_audio' ? 'audio' : role === 'reference_video' ? 'video' : 'image',
  role,
  url: `s3://bucket/users/account/media/${mediaObjectId}/original`,
  mediaObjectId,
  source: { type: 'media_object', mediaObjectId },
  ...overrides,
})

const taskWithMedia = (media: Task['config']['media']): Task => ({
  id: 'task_1',
  accountId: 'account',
  kind: 'video_generation',
  mode: 'async',
  provider: 'volcengine',
  model: 'doubao-seedance-2-0-260128',
  status: 'running',
  config: {
    kind: 'video_generation',
    provider: 'volcengine',
    model: 'doubao-seedance-2-0-260128',
    prompt: 'video',
    media,
    params: {},
  },
  cost: {
    estimatedCost: 1,
    usage: {
      amount: 1,
      metric: 'duration_second',
    },
  },
  createdAt: now,
  updatedAt: now,
})

const createResolver = () => {
  const storage = new CountingObjectStorage('bucket')
  const { repository, service } = createMediaObjectTestScenario({ storage })
  const resolver = new ProviderMediaUrlResolver(service, 14_400)
  return { repository, resolver, storage }
}

const addReadyMediaObjects = async (
  repository: ReturnType<typeof createMediaObjectTestScenario>['repository'],
  ids: string[],
): Promise<void> => {
  for (const id of ids) {
    await repository.create(buildReadyMediaObject({
      accountId: 'account',
      id,
      kind: id.includes('audio') ? 'audio' : id.includes('video') ? 'video' : 'image',
      storageKey: `users/account/media/${id}/original`,
      updatedAt: now,
      url: `s3://bucket/users/account/media/${id}/original`,
    }))
  }
}

describe('ProviderMediaUrlResolver', () => {
  test('signs media object inputs across every task media slot without mutating the durable task', async () => {
    const { repository, resolver, storage } = createResolver()
    await addReadyMediaObjects(repository, ['media_duplicate', 'media_first', 'media_last', 'media_audio', 'media_video'])
    const duplicate = mediaInput('reference_image', 'media_duplicate')
    const originalTask = taskWithMedia({
      inputImages: [
        duplicate,
        { kind: 'image', role: 'reference_image', url: 'https://cdn.example/external.png', source: { type: 'external_url' } },
      ],
      firstFrame: mediaInput('first_frame', 'media_first'),
      lastFrame: {
        kind: 'image',
        role: 'last_frame',
        url: 's3://bucket/users/account/media/media_last/original.png',
        source: { type: 'media_object', mediaObjectId: 'media_last' },
      },
      referenceImages: [duplicate],
      referenceAudios: [mediaInput('reference_audio', 'media_audio')],
      referenceVideos: [
        mediaInput('reference_video', 'media_video', {
          source: {
            type: 'workflow_current_media',
            workflowId: 'workflow_1',
            nodeId: 'node_1',
            taskId: 'task_source',
          },
        }),
      ],
    })

    const resolved = await resolver.resolve(originalTask)

    expect(resolved).not.toBe(originalTask)
    expect(originalTask.config.media.inputImages[0]?.url).toBe('s3://bucket/users/account/media/media_duplicate/original')
    expect(resolved.config.media.inputImages[0]?.url.startsWith('https://signed.example/')).toBe(true)
    expect(resolved.config.media.inputImages[1]?.url).toBe('https://cdn.example/external.png')
    expect(resolved.config.media.firstFrame?.url.startsWith('https://signed.example/')).toBe(true)
    expect(resolved.config.media.lastFrame?.url.startsWith('https://signed.example/')).toBe(true)
    expect(resolved.config.media.referenceImages[0]?.url).toBe(resolved.config.media.inputImages[0]?.url)
    expect(resolved.config.media.referenceAudios[0]?.url.startsWith('https://signed.example/')).toBe(true)
    expect(resolved.config.media.referenceVideos[0]?.url.startsWith('https://signed.example/')).toBe(true)
    expect(resolved.config.media.lastFrame?.mediaObjectId).toBeUndefined()
    expect(resolved.config.media.lastFrame?.source).toEqual({ type: 'media_object', mediaObjectId: 'media_last' })
    expect(storage.getUrlCalls).toHaveLength(5)
    expect(storage.getUrlCalls.map((call) => call.expiresInSeconds)).toEqual([14_400, 14_400, 14_400, 14_400, 14_400])
    expect(storage.getUrlCalls.every((call) => call.responseCacheControl === undefined)).toBe(true)
  })

  test('leaves external urls and data urls unchanged when no media objects are present', async () => {
    const { resolver, storage } = createResolver()
    const task = taskWithMedia({
      inputImages: [
        { kind: 'image', role: 'reference_image', url: 'data:image/png;base64,abc', source: { type: 'external_url' } },
      ],
      referenceImages: [
        { kind: 'image', role: 'reference_image', url: 'https://cdn.example/reference.png', source: { type: 'external_url' } },
      ],
      referenceAudios: [],
      referenceVideos: [],
    })

    const resolved = await resolver.resolve(task)

    expect(resolved).toBe(task)
    expect(storage.getUrlCalls).toHaveLength(0)
  })

  test('rejects internal s3 urls without a media object id', async () => {
    const { resolver } = createResolver()
    const task = taskWithMedia({
      inputImages: [
        {
          kind: 'image',
          role: 'reference_image',
          url: 's3://bucket/users/account/media/orphan/original.png',
          source: { type: 'external_url' },
        },
      ],
      referenceImages: [],
      referenceAudios: [],
      referenceVideos: [],
    })

    await expect(resolver.resolve(task)).rejects.toThrow('Provider media input requires mediaObjectId')
  })
})

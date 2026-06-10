import { describe, expect, test } from 'bun:test'

import type { CreatePresignedGetUrlInput } from '../../../lib/storage/object-storage'
import { FakeObjectStorage } from '../../../test/doubles'
import { createMediaObjectTestScenario } from '../../../test/scenarios/media-object-scenario'
import { DeterministicVideoFrameGenerator, FfmpegVideoFrameGenerator } from './video-frame-generator'

class ReadUrlTrackingStorage extends FakeObjectStorage {
  readonly readUrlRequests: CreatePresignedGetUrlInput[] = []

  override async createPresignedGetUrl(input: CreatePresignedGetUrlInput): Promise<string> {
    this.readUrlRequests.push(input)
    return super.createPresignedGetUrl(input)
  }
}

const createMediaObjectService = () => {
  const storage = new ReadUrlTrackingStorage()
  const { service: mediaObjectService } = createMediaObjectTestScenario({
    storage,
    fetcher: {
      fetch: async () => ({
        body: new Uint8Array(),
        byteSize: 0,
        contentType: 'video/mp4',
      }),
    },
  })
  return { mediaObjectService, storage }
}

const jpegMagic = Uint8Array.from([0xff, 0xd8, 0xff])

describe('video frame generators', () => {
  test('deterministic fallback stores a valid JPEG placeholder', async () => {
    const { mediaObjectService, storage } = createMediaObjectService()
    const frame = await new DeterministicVideoFrameGenerator(mediaObjectService).generateFrame({
      accountId: 'account_1',
      frameRole: 'video_cover',
      taskId: 'task_video',
      video: {
        id: 'task_video:video:0',
        index: 0,
        kind: 'video',
        role: 'generated_video',
        url: 's3://bucket/users/account_1/media/media_video/original.mp4',
      },
    })

    expect(frame.mediaObjectId).toMatch(/^media_/)
    const stored = storage.getObjectForTest(`users/account_1/media/${frame.mediaObjectId}/cover.jpg`)
    expect(stored?.contentType).toBe('image/jpeg')
    expect(stored?.body).toBeInstanceOf(Uint8Array)
    expect(Array.from((stored?.body as Uint8Array).slice(0, 3))).toEqual(Array.from(jpegMagic))
    expect(frame.metadata?.derivativeStatus).toBe('fallback')
    expect(frame.metadata?.fallbackReason).toBe('ffmpeg_failed')
  })

  test('ffmpeg generator resolves finalized media object videos through read URLs before cover fallback', async () => {
    const { mediaObjectService, storage } = createMediaObjectService()
    const video = await mediaObjectService.createFromBuffer({
      accountId: 'account_1',
      body: new TextEncoder().encode('not an actual mp4'),
      kind: 'video',
      mimeType: 'video/mp4',
      origin: 'task_output',
      purpose: 'task_output',
      retention: 'task_scoped',
    })
    const frame = await new FfmpegVideoFrameGenerator(mediaObjectService).generateFrame({
      accountId: 'account_1',
      frameRole: 'video_cover',
      taskId: 'task_video',
      video: {
        id: 'task_video:video:0',
        index: 0,
        kind: 'video',
        mediaObjectId: video.id,
        metadata: { sourceProviderUrl: 'https://expired-provider-url.example/video.mp4' },
        role: 'generated_video',
        url: video.url,
      },
    })

    expect(frame.mediaObjectId).toMatch(/^media_/)
    expect(frame.role).toBe('video_cover')
    expect(frame.metadata?.derivativeStatus).toBe('fallback')
    expect(frame.metadata?.fallbackReason).toBe('ffmpeg_failed')
    expect(frame.metadata?.sourceVideoResourceId).toBe('task_video:video:0')
    expect(storage.readUrlRequests).toEqual([
      {
        accountId: 'account_1',
        expiresInSeconds: 300,
        key: video.storageKey,
      },
    ])
  })

  test('ffmpeg generator does not use provider URLs as the post-processing source', async () => {
    const { mediaObjectService, storage } = createMediaObjectService()
    const frame = await new FfmpegVideoFrameGenerator(mediaObjectService).generateFrame({
      accountId: 'account_1',
      frameRole: 'video_cover',
      taskId: 'task_video',
      video: {
        id: 'task_video:video:0',
        index: 0,
        kind: 'video',
        metadata: { sourceProviderUrl: 'https://provider.example/video.mp4' },
        role: 'generated_video',
        url: 's3://bucket/users/account_1/media/media_video/original.mp4',
      },
    })

    expect(frame.metadata?.derivativeStatus).toBe('fallback')
    expect(frame.metadata?.fallbackReason).toBe('video_url_missing')
    expect(storage.readUrlRequests).toEqual([])
  })
})

import { describe, expect, test } from 'bun:test'
import type { Task } from '@mina/contracts/modules/tasks'

import { GoogleGeminiImageSpec } from './google/image/gemini.spec'
import { GoogleVeoSpec } from './google/video/veo.spec'
import type { VolcengineProviderClient } from './volcengine/common/client'
import { VolcengineSeedreamSpec } from './volcengine/image/seedream.spec'
import { VolcengineSeedanceSpec } from './volcengine/video/seedance.spec'

const imageInput = (url = 'data:image/png;base64,abc') => ({
  kind: 'image' as const,
  role: 'reference_image' as const,
  url,
})

const seedreamTask = (count: number): Task => ({
  accountId: 'account',
  config: {
    kind: 'image_generation',
    media: {
      inputImages: [],
      referenceAudios: [],
      referenceImages: [],
      referenceVideos: [],
    },
    model: 'doubao-seedream-5-0-260128',
    params: {
      count,
      optimizePrompt: false,
      size: '2048x2048',
      webSearch: false,
    },
    prompt: 'image',
    provider: 'volcengine',
  },
  cost: {
    estimatedCost: count,
    usage: {
      amount: count,
      metric: 'image',
    },
  },
  createdAt: new Date().toISOString(),
  id: 'task_seedream',
  kind: 'image_generation',
  mode: 'sync',
  model: 'doubao-seedream-5-0-260128',
  provider: 'volcengine',
  status: 'running',
  updatedAt: new Date().toISOString(),
})

class FakeVolcengineImageClient {
  readonly bodies: Record<string, unknown>[] = []

  constructor(private readonly results: Array<{ data?: Array<{ url: string }> } | Error>) {}

  async generateImages(_model: string, body: Record<string, unknown>) {
    this.bodies.push(body)
    const next = this.results.shift()
    if (next instanceof Error) {
      throw next
    }
    return next ?? { data: [{ url: 'https://cdn/fallback.png' }] }
  }
}

describe('provider model specs', () => {
  test('Google Gemini image applies defaults and derives pricing/resources', () => {
    const spec = new GoogleGeminiImageSpec('gemini-3.1-flash-image-preview')
    const config = spec.prepareConfig({
      draft: {
        kind: 'image_generation',
        provider: 'google',
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'image',
        params: {},
      },
      media: {
        inputImages: [imageInput()],
        referenceImages: [],
        referenceAudios: [],
        referenceVideos: [],
      },
    })
    const parsed = spec.parseConfig(config)

    expect(parsed.params).toMatchObject({ aspectRatio: '1:1', count: 1, imageSize: '1K' })
    expect(spec.collectInputResources(parsed)).toHaveLength(1)
    expect(spec.getPricingInput(parsed)).toMatchObject({
      billingMetric: 'image',
      pricingKey: 'size:1K',
      usageAmount: 1,
    })
  })

  test('image specs reject referenceImages instead of treating them as image inputs', () => {
    const spec = new VolcengineSeedreamSpec('doubao-seedream-5-0-260128')

    expect(() =>
      spec.prepareConfig({
        draft: {
          kind: 'image_generation',
          provider: 'volcengine',
          model: 'doubao-seedream-5-0-260128',
          prompt: 'image',
          params: {},
        },
        media: {
          inputImages: [imageInput('https://cdn/input.png')],
          referenceImages: [imageInput('https://cdn/reference.png')],
          referenceAudios: [],
          referenceVideos: [],
        },
      }),
    ).toThrow('Volcengine Seedream referenceImages is not supported')
  })

  test('Google Veo rejects too many reference images', () => {
    const spec = new GoogleVeoSpec('veo-3.1-generate-preview')

    expect(() =>
      spec.prepareConfig({
        draft: {
          kind: 'video_generation',
          provider: 'google',
          model: 'veo-3.1-generate-preview',
          prompt: 'video',
          params: {},
        },
        media: {
          inputImages: [],
          referenceImages: [imageInput(), imageInput(), imageInput(), imageInput()],
          referenceAudios: [],
          referenceVideos: [],
        },
      }),
    ).toThrow('supports at most 3')
  })

  test('Volcengine Seedream validates model output formats', () => {
    const spec = new VolcengineSeedreamSpec('doubao-seedream-4-5-251128')

    expect(() =>
      spec.prepareConfig({
        draft: {
          kind: 'image_generation',
          provider: 'volcengine',
          model: 'doubao-seedream-4-5-251128',
          prompt: 'image',
          params: {
            outputFormat: 'png',
          },
        },
        media: {
          inputImages: [],
          referenceImages: [],
          referenceAudios: [],
          referenceVideos: [],
        },
      }),
    ).toThrow('does not support png')
  })

  test('Volcengine Seedream calls the image provider once per requested output', async () => {
    const client = new FakeVolcengineImageClient([
      { data: [{ url: 'https://cdn/image-1.png' }] },
      { data: [{ url: 'https://cdn/image-2.png' }] },
      { data: [{ url: 'https://cdn/image-3.png' }] },
    ])
    const spec = new VolcengineSeedreamSpec(
      'doubao-seedream-5-0-260128',
      client as unknown as VolcengineProviderClient,
      new Map(),
    )

    const result = await spec.start(spec.parseTask(seedreamTask(3)))

    expect(client.bodies).toHaveLength(3)
    expect(client.bodies.every((body) => body.model === 'doubao-seedream-5-0-260128')).toBe(true)
    expect(result.status).toBe('succeeded')
    if (result.status !== 'succeeded') {
      throw new Error('Expected Seedream generation to succeed.')
    }
    expect(result.actualUsage).toEqual({ amount: 3, metric: 'image' })
    expect(result.metadata).toMatchObject({
      failedImageCount: 0,
      requestedImageCount: 3,
      succeededImageCount: 3,
    })
    expect(result.output.resources.map((resource) => resource.url)).toEqual([
      'https://cdn/image-1.png',
      'https://cdn/image-2.png',
      'https://cdn/image-3.png',
    ])
    expect(result.output.resources.map((resource) => resource.index)).toEqual([0, 1, 2])
  })

  test('Volcengine Seedream succeeds with partial outputs when some vendor calls fail', async () => {
    const client = new FakeVolcengineImageClient([
      { data: [{ url: 'https://cdn/image-1.png' }] },
      new Error('provider timeout'),
      { data: [{ url: 'https://cdn/image-3.png' }] },
    ])
    const spec = new VolcengineSeedreamSpec(
      'doubao-seedream-5-0-260128',
      client as unknown as VolcengineProviderClient,
      new Map(),
    )

    const result = await spec.start(spec.parseTask(seedreamTask(3)))

    expect(result.status).toBe('succeeded')
    if (result.status !== 'succeeded') {
      throw new Error('Expected partial Seedream generation to succeed.')
    }
    expect(result.actualUsage).toEqual({ amount: 2, metric: 'image' })
    expect(result.metadata).toMatchObject({
      failedImageCount: 1,
      partialFailures: [{ attempt: 1, message: 'provider timeout' }],
      requestedImageCount: 3,
      succeededImageCount: 2,
    })
    expect(result.output.resources.map((resource) => resource.url)).toEqual([
      'https://cdn/image-1.png',
      'https://cdn/image-3.png',
    ])
  })

  test('Volcengine Seedream fails only when every requested image call fails', async () => {
    const client = new FakeVolcengineImageClient([
      new Error('first failed'),
      new Error('second failed'),
    ])
    const spec = new VolcengineSeedreamSpec(
      'doubao-seedream-5-0-260128',
      client as unknown as VolcengineProviderClient,
      new Map(),
    )

    const result = await spec.start(spec.parseTask(seedreamTask(2)))

    expect(result).toMatchObject({
      code: 'VOLCENGINE_SEEDREAM_NO_IMAGE_OUTPUT',
      metadata: {
        failedImageCount: 2,
        partialFailures: [
          { attempt: 0, message: 'first failed' },
          { attempt: 1, message: 'second failed' },
        ],
        requestedImageCount: 2,
        succeededImageCount: 0,
      },
      status: 'failed',
    })
  })

  test('Volcengine Seedance derives async mode, pricing, and resources', () => {
    const spec = new VolcengineSeedanceSpec('doubao-seedance-2-0-260128')
    const config = spec.prepareConfig({
      draft: {
        kind: 'video_generation',
        provider: 'volcengine',
        model: 'doubao-seedance-2-0-260128',
        prompt: 'video',
        params: {
          durationSeconds: 6,
          resolution: '720p',
        },
      },
      media: {
        inputImages: [],
        firstFrame: { ...imageInput(), role: 'first_frame' },
        referenceImages: [imageInput()],
        referenceAudios: [],
        referenceVideos: [],
      },
    })
    const parsed = spec.parseConfig(config)

    expect(spec.getTaskMode()).toBe('async')
    expect(spec.collectInputResources(parsed).map((input) => input.role)).toEqual(['first_frame', 'reference_image'])
    expect(spec.getPricingInput(parsed)).toMatchObject({
      pricingKey: 'resolution:720p',
      usageAmount: 6,
    })
  })
})

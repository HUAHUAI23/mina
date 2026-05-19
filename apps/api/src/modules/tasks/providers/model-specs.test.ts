import { describe, expect, test } from 'bun:test'

import { GoogleGeminiImageSpec } from './google/image/gemini.spec'
import { GoogleVeoSpec } from './google/video/veo.spec'
import { VolcengineSeedreamSpec } from './volcengine/image/seedream.spec'
import { VolcengineSeedanceSpec } from './volcengine/video/seedance.spec'

const imageInput = (url = 'data:image/png;base64,abc') => ({
  kind: 'image' as const,
  role: 'reference_image' as const,
  url,
})

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

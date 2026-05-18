import { describe, expect, test } from 'bun:test'

import { buildGoogleGeminiImageRequest, googleGeminiImageOutputFromResponse } from './google/image/gemini.mapper'
import { buildGoogleVeoRequest, googleVeoOutputFromOperation } from './google/video/veo.mapper'
import { buildVolcengineSeedreamRequest, volcengineSeedreamOutputFromImages } from './volcengine/image/seedream.mapper'
import { buildVolcengineSeedanceRequest, volcengineSeedanceOutputFromTask } from './volcengine/video/seedance.mapper'

describe('provider mappers', () => {
  test('maps Google Gemini image requests and outputs', () => {
    const request = buildGoogleGeminiImageRequest({
      aspectRatio: '1:1',
      imageSearch: true,
      imageSize: '1K',
      includeThoughts: false,
      prompt: 'image',
      referenceImages: [{ data: 'abc', mimeType: 'image/png' }],
      webSearch: true,
    })

    expect(request).toMatchObject({
      generationConfig: {
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      },
      tools: [{ google_search: { searchTypes: { imageSearch: {}, webSearch: {} } } }],
    })

    const output = googleGeminiImageOutputFromResponse('task', {
      candidates: [{ content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }] } }],
    })
    expect(output.resources[0]?.url).toBe('data:image/png;base64,abc')
  })

  test('maps Google Veo requests and operation outputs', () => {
    const request = buildGoogleVeoRequest({
      aspectRatio: '16:9',
      durationSeconds: 8,
      personGeneration: 'allow_all',
      prompt: 'video',
      referenceImages: [],
      resolution: '720p',
    })
    expect(request).toMatchObject({
      instances: [{ prompt: 'video' }],
      parameters: {
        durationSeconds: '8',
      },
    })

    const output = googleVeoOutputFromOperation('task', {
      name: 'operations/1',
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [{ video: { uri: 'https://cdn/video.mp4' } }],
        },
      },
    })
    expect(output.resources[0]?.role).toBe('generated_video')
  })

  test('maps Volcengine Seedream requests and outputs', () => {
    const request = buildVolcengineSeedreamRequest('image', {
      count: 1,
      images: ['https://cdn/ref.png'],
      model: 'seedream',
      optimizePrompt: true,
      outputFormat: 'png',
      sequentialImageGeneration: 'auto',
      size: '2048x2048',
      webSearch: true,
    })

    expect(request).toMatchObject({
      image: 'https://cdn/ref.png',
      model: 'seedream',
      optimize_prompt_options: { mode: 'standard' },
      output_format: 'png',
      tools: [{ type: 'web_search' }],
    })

    const output = volcengineSeedreamOutputFromImages('task', [{ url: 'https://cdn/image.png', index: 0 }])
    expect(output.variables.imageUrls).toEqual(['https://cdn/image.png'])
  })

  test('maps Volcengine Seedance requests and outputs', () => {
    const request = buildVolcengineSeedanceRequest('video', {
      durationSeconds: 5,
      media: [{ kind: 'image', role: 'first_frame', url: 'https://cdn/first.png' }],
      model: 'seedance',
      ratio: '16:9',
      resolution: '720p',
      returnLastFrame: true,
      webSearch: true,
    })

    expect(request).toMatchObject({
      content: [
        { type: 'text', text: 'video' },
        { type: 'image_url', role: 'first_frame', image_url: { url: 'https://cdn/first.png' } },
      ],
      return_last_frame: true,
      tools: [{ type: 'web_search' }],
    })

    const output = volcengineSeedanceOutputFromTask('task', {
      id: 'provider-task',
      status: 'succeeded',
      content: {
        last_frame_url: 'https://cdn/last.png',
        video_url: 'https://cdn/video.mp4',
      },
    })
    expect(output.resources.map((resource) => resource.role)).toEqual(['generated_video', 'last_frame'])
  })
})

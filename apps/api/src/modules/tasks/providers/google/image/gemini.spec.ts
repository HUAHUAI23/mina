import { z } from 'zod'
import type { MediaInput, TaskConfig } from '@mina/contracts/modules/tasks'

import { imageMediaEnvelope } from '../../../config/media-envelope'
import {
  assertMediaLimit,
  assertNoMediaItem,
  assertNoMediaItems,
  mediaConfigFromEnvelope,
  mediaEnvelopeFromConfig,
  parseConfigForModel,
  parseParams,
} from '../../../models/model-spec-base'
import type { ModelSpec, ParsedTask, ParsedTaskConfig, PrepareConfigInput } from '../../../models/model-spec'
import type { ProviderPollResult, ProviderStartResult } from '../../provider'
import { GoogleProviderClient } from '../common/client'
import { buildGoogleGeminiImageRequest, googleGeminiImageOutputFromResponse } from './gemini.mapper'

const GOOGLE_IMAGE_ASPECT_RATIOS = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'] as const
const GOOGLE_IMAGE_SIZES = ['512', '1K', '2K', '4K'] as const
const GOOGLE_IMAGE_PRO_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const
const GOOGLE_IMAGE_PRO_SIZES = ['1K', '2K', '4K'] as const

const modelCapabilities = new Map<string, {
  aspectRatios: readonly string[]
  imageSearch: boolean
  sizes: readonly string[]
  thinking: boolean
}>([
  ['gemini-3.1-flash-image-preview', {
    aspectRatios: GOOGLE_IMAGE_ASPECT_RATIOS,
    imageSearch: true,
    sizes: GOOGLE_IMAGE_SIZES,
    thinking: true,
  }],
  ['gemini-3-pro-image-preview', {
    aspectRatios: GOOGLE_IMAGE_PRO_ASPECT_RATIOS,
    imageSearch: false,
    sizes: GOOGLE_IMAGE_PRO_SIZES,
    thinking: false,
  }],
])

export const GoogleGeminiImageParamsSchema = z.object({
  aspectRatio: z.enum(GOOGLE_IMAGE_ASPECT_RATIOS).default('1:1'),
  count: z.number().int().min(1).max(16).default(1),
  imageSearch: z.boolean().default(false),
  imageSize: z.enum(GOOGLE_IMAGE_SIZES).default('1K'),
  includeThoughts: z.boolean().default(false),
  thinkingLevel: z.enum(['minimal', 'high']).optional(),
  webSearch: z.boolean().default(false),
})

export type GoogleGeminiImageParams = z.infer<typeof GoogleGeminiImageParamsSchema>

const imageDataFromMedia = (media: MediaInput): { data: string; mimeType: string } => {
  if (!media.url.startsWith('data:')) {
    throw new Error('Google Gemini image references must use data URLs in this implementation.')
  }
  const match = /^data:([^;,]+);base64,(.+)$/.exec(media.url)
  if (!match?.[1] || !match[2]) {
    throw new Error('Google Gemini image reference data URL is invalid.')
  }
  return {
    mimeType: match[1],
    data: match[2],
  }
}

export class GoogleGeminiImageSpec implements ModelSpec<GoogleGeminiImageParams> {
  readonly key: { kind: 'image_generation'; provider: 'google'; model: string }

  readonly paramsSchema = GoogleGeminiImageParamsSchema

  readonly capabilities = {
    media: {
      inputImages: { max: 14 },
    },
    output: {
      images: true,
    },
  } as const

  constructor(
    model = 'gemini-3.1-flash-image-preview',
    private readonly client = new GoogleProviderClient(),
  ) {
    this.key = {
      kind: 'image_generation',
      provider: 'google',
      model,
    }
  }

  prepareConfig(input: PrepareConfigInput): TaskConfig {
    const params = parseParams(this.paramsSchema, input.draft.params)
    const media = imageMediaEnvelope(input.media)
    const capability = modelCapabilities.get(this.key.model) ?? modelCapabilities.get('gemini-3.1-flash-image-preview')
    if (!capability?.aspectRatios.includes(params.aspectRatio)) {
      throw new Error(`Google Gemini model ${this.key.model} does not support aspect ratio ${params.aspectRatio}.`)
    }
    if (!capability.sizes.includes(params.imageSize)) {
      throw new Error(`Google Gemini model ${this.key.model} does not support image size ${params.imageSize}.`)
    }
    if (params.imageSearch && !capability.imageSearch) {
      throw new Error(`Google Gemini model ${this.key.model} does not support image search grounding.`)
    }
    if ((params.thinkingLevel || params.includeThoughts) && !capability.thinking) {
      throw new Error(`Google Gemini model ${this.key.model} does not support thinking controls.`)
    }
    assertNoMediaItem('Google Gemini firstFrame', media.firstFrame)
    assertNoMediaItem('Google Gemini lastFrame', media.lastFrame)
    assertNoMediaItems('Google Gemini referenceImages', media.referenceImages)
    assertNoMediaItems('Google Gemini referenceAudios', media.referenceAudios)
    assertNoMediaItems('Google Gemini referenceVideos', media.referenceVideos)
    assertMediaLimit('Google Gemini inputImages', media.inputImages, undefined, 14)
    return {
      kind: this.key.kind,
      provider: this.key.provider,
      model: this.key.model,
      prompt: input.draft.prompt,
      media: mediaConfigFromEnvelope(media),
      params,
    }
  }

  parseConfig(config: TaskConfig): ParsedTaskConfig<GoogleGeminiImageParams> {
    return parseConfigForModel(this.key, this.paramsSchema, this.prepareConfig({
      draft: config,
      media: mediaEnvelopeFromConfig(config),
    }))
  }

  parseTask(task: ParsedTask<Record<string, unknown>>): ParsedTask<GoogleGeminiImageParams> {
    return {
      ...task,
      config: this.parseConfig(task.config),
    }
  }

  getTaskMode(): 'sync' {
    return 'sync'
  }

  getPricingInput(config: ParsedTaskConfig<GoogleGeminiImageParams>) {
    return {
      taskKind: config.kind,
      provider: config.provider,
      model: config.model,
      pricingKey: `size:${config.params.imageSize}`,
      billingMetric: 'image' as const,
      usageAmount: config.params.count,
    }
  }

  collectInputResources(config: ParsedTaskConfig<GoogleGeminiImageParams>): MediaInput[] {
    return config.media.inputImages
  }

  async start(task: ParsedTask<GoogleGeminiImageParams>): Promise<ProviderStartResult> {
    const referenceImages = this.collectInputResources(task.config).map(imageDataFromMedia)
    const response = await this.client.generateImage(
      task.model,
      buildGoogleGeminiImageRequest({
        aspectRatio: task.config.params.aspectRatio,
        imageSearch: task.config.params.imageSearch,
        imageSize: task.config.params.imageSize,
        includeThoughts: task.config.params.includeThoughts,
        prompt: task.config.prompt,
        referenceImages,
        ...(task.config.params.thinkingLevel ? { thinkingLevel: task.config.params.thinkingLevel } : {}),
        webSearch: task.config.params.webSearch,
      }),
    )
    return {
      ...(response.usageMetadata?.totalTokenCount
        ? { actualUsage: { amount: response.usageMetadata.totalTokenCount, metric: 'token' as const } }
        : {}),
      output: googleGeminiImageOutputFromResponse(task.id, response),
      status: 'succeeded',
    }
  }

  async poll(): Promise<ProviderPollResult> {
    return {
      code: 'GOOGLE_IMAGE_NOT_ASYNC',
      message: 'Google Gemini image tasks are synchronous.',
      status: 'failed',
    }
  }
}

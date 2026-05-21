import type { MediaInput, TaskConfig } from '@mina/contracts/modules/tasks'
import {
  GoogleVeoParamsSchema,
  type GoogleVeoParams,
} from '@mina/contracts/modules/tasks/video-model-params'

import {
  assertMediaLimit,
  assertNoMediaItems,
  mediaConfigFromEnvelope,
  mediaEnvelopeFromConfig,
  parseConfigForModel,
  parseParams,
} from '../../../models/model-spec-base'
import type { ModelSpec, ParsedTask, ParsedTaskConfig, PrepareConfigInput } from '../../../models/model-spec'
import type { ProviderPollResult, ProviderStartResult } from '../../provider'
import { GoogleProviderClient } from '../common/client'
import { buildGoogleVeoRequest, googleVeoOutputFromOperation } from './veo.mapper'

const imageDataFromMedia = (media: MediaInput): { data: string; mimeType: string } => {
  if (!media.url.startsWith('data:')) {
    throw new Error('Google Veo image inputs must use data URLs in this implementation.')
  }
  const match = /^data:([^;,]+);base64,(.+)$/.exec(media.url)
  if (!match?.[1] || !match[2]) {
    throw new Error('Google Veo image input data URL is invalid.')
  }
  return {
    mimeType: match[1],
    data: match[2],
  }
}

export class GoogleVeoSpec implements ModelSpec<GoogleVeoParams> {
  readonly key: { kind: 'video_generation'; provider: 'google'; model: string }

  readonly paramsSchema = GoogleVeoParamsSchema

  readonly capabilities = {
    media: {
      firstFrame: true,
      lastFrame: true,
      referenceImages: { max: 3 },
    },
    output: {
      video: true,
    },
  } as const

  constructor(
    model = 'veo-3.1-generate-preview',
    private readonly client = new GoogleProviderClient(),
  ) {
    this.key = {
      kind: 'video_generation',
      provider: 'google',
      model,
    }
  }

  prepareConfig(input: PrepareConfigInput): TaskConfig {
    const params = parseParams(this.paramsSchema, input.draft.params)
    assertNoMediaItems('Google Veo inputImages', input.media.inputImages)
    assertNoMediaItems('Google Veo referenceAudios', input.media.referenceAudios)
    assertNoMediaItems('Google Veo referenceVideos', input.media.referenceVideos)
    assertMediaLimit('Google Veo referenceImages', input.media.referenceImages, undefined, 3)
    if (input.media.lastFrame && !input.media.firstFrame) {
      throw new Error('Google Veo lastFrame requires firstFrame.')
    }
    if (input.media.referenceImages.length > 0 && (input.media.firstFrame || input.media.lastFrame)) {
      throw new Error('Google Veo referenceImages cannot be combined with firstFrame or lastFrame.')
    }
    if ((params.resolution === '1080p' || params.resolution === '4k') && params.durationSeconds !== 8) {
      throw new Error('Google Veo 1080p and 4k generation requires durationSeconds to be 8.')
    }
    return {
      kind: this.key.kind,
      provider: this.key.provider,
      model: this.key.model,
      prompt: input.draft.prompt,
      media: mediaConfigFromEnvelope(input.media),
      params,
    }
  }

  parseConfig(config: TaskConfig): ParsedTaskConfig<GoogleVeoParams> {
    return parseConfigForModel(this.key, this.paramsSchema, this.prepareConfig({
      draft: config,
      media: mediaEnvelopeFromConfig(config),
    }))
  }

  parseTask(task: ParsedTask<Record<string, unknown>>): ParsedTask<GoogleVeoParams> {
    return {
      ...task,
      config: this.parseConfig(task.config),
    }
  }

  getTaskMode(): 'async' {
    return 'async'
  }

  getPricingInput(config: ParsedTaskConfig<GoogleVeoParams>) {
    return {
      taskKind: config.kind,
      provider: config.provider,
      model: config.model,
      pricingKey: `resolution:${config.params.resolution}`,
      billingMetric: 'duration_second' as const,
      usageAmount: config.params.durationSeconds,
    }
  }

  collectInputResources(config: ParsedTaskConfig<GoogleVeoParams>): MediaInput[] {
    return [
      ...(config.media.firstFrame ? [config.media.firstFrame] : []),
      ...(config.media.lastFrame ? [config.media.lastFrame] : []),
      ...config.media.referenceImages,
    ]
  }

  async start(task: ParsedTask<GoogleVeoParams>): Promise<ProviderStartResult> {
    const operation = await this.client.createVideo(
      task.model,
      buildGoogleVeoRequest({
        aspectRatio: task.config.params.aspectRatio,
        durationSeconds: task.config.params.durationSeconds,
        ...(task.config.media.firstFrame ? { firstFrame: imageDataFromMedia(task.config.media.firstFrame) } : {}),
        ...(task.config.media.lastFrame ? { lastFrame: imageDataFromMedia(task.config.media.lastFrame) } : {}),
        personGeneration: task.config.params.personGeneration,
        prompt: task.config.prompt,
        referenceImages: task.config.media.referenceImages.map(imageDataFromMedia),
        resolution: task.config.params.resolution,
      }),
    )

    return {
      externalTaskId: operation.name,
      metadata: {
        operationName: operation.name,
      },
      providerStatus: operation.done ? 'done' : 'submitted',
      status: 'submitted',
    }
  }

  async poll(task: ParsedTask<GoogleVeoParams>): Promise<ProviderPollResult> {
    if (!task.externalTaskId) {
      return {
        code: 'GOOGLE_OPERATION_MISSING',
        message: 'Google Veo task is missing an operation name.',
        status: 'failed',
      }
    }

    const operation = await this.client.getVideoOperation(task.externalTaskId)
    if (operation.error) {
      return {
        code: operation.error.status ?? String(operation.error.code ?? 'GOOGLE_VIDEO_FAILED'),
        message: operation.error.message ?? 'Google Veo task failed.',
        ...(operation.error.status ? { providerStatus: operation.error.status } : {}),
        status: 'failed',
      }
    }
    if (!operation.done) {
      return {
        providerStatus: 'running',
        status: 'pending',
      }
    }
    return {
      output: googleVeoOutputFromOperation(task.id, operation),
      providerStatus: 'succeeded',
      status: 'succeeded',
    }
  }
}

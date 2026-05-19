import { z } from 'zod'
import type { MediaInput, TaskConfig } from '@mina/contracts/modules/tasks'

import { apiEnv } from '../../../../../config/env'
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
import { TaskConfigValidationError } from '../../../config/validation-error'
import type { ModelSpec, ParsedTask, ParsedTaskConfig, PrepareConfigInput } from '../../../models/model-spec'
import type { ProviderPollResult, ProviderStartResult } from '../../provider'
import { VolcengineProviderClient } from '../common/client'
import { parseJsonStringMap, resolveAlias } from '../common/model-aliases'
import { buildVolcengineSeedreamRequest, type VolcengineGeneratedImage, volcengineSeedreamOutputFromImages } from './seedream.mapper'

export const VolcengineSeedreamParamsSchema = z.object({
  count: z.number().int().min(1).max(16).default(1),
  maxImages: z.number().int().min(1).max(16).optional(),
  optimizePrompt: z.boolean().default(false),
  outputFormat: z.enum(['png', 'jpeg']).optional(),
  sequentialImageGeneration: z.enum(['auto', 'disabled']).optional(),
  size: z.string().min(1).default('2048x2048'),
  watermark: z.boolean().optional(),
  webSearch: z.boolean().default(false),
})

export type VolcengineSeedreamParams = z.infer<typeof VolcengineSeedreamParamsSchema>

const outputFormatSupport = new Map<string, readonly string[]>([
  ['doubao-seedream-5-0-260128', ['png', 'jpeg']],
  ['doubao-seedream-4-5-251128', ['jpeg']],
])
const sizeLabelSupport = new Map<string, readonly string[]>([
  ['doubao-seedream-5-0-260128', ['2K', '3K']],
  ['doubao-seedream-4-5-251128', ['2K', '4K']],
])

export class VolcengineSeedreamSpec implements ModelSpec<VolcengineSeedreamParams> {
  readonly key: { kind: 'image_generation'; provider: 'volcengine'; model: string }

  readonly paramsSchema = VolcengineSeedreamParamsSchema

  readonly capabilities = {
    media: {
      inputImages: { max: 16 },
    },
    output: {
      images: true,
    },
  } as const

  private readonly aliases: Map<string, string>

  constructor(
    model = 'doubao-seedream-5-0-260128',
    private readonly client = new VolcengineProviderClient(),
    aliases = parseJsonStringMap(apiEnv.volcengineImageModelAliases),
  ) {
    this.key = {
      kind: 'image_generation',
      provider: 'volcengine',
      model,
    }
    this.aliases = aliases
  }

  prepareConfig(input: PrepareConfigInput): TaskConfig {
    const params = parseParams(this.paramsSchema, input.draft.params)
    const media = imageMediaEnvelope(input.media)
    assertNoMediaItem('Volcengine Seedream firstFrame', media.firstFrame)
    assertNoMediaItem('Volcengine Seedream lastFrame', media.lastFrame)
    assertNoMediaItems('Volcengine Seedream referenceImages', media.referenceImages)
    assertNoMediaItems('Volcengine Seedream referenceAudios', media.referenceAudios)
    assertNoMediaItems('Volcengine Seedream referenceVideos', media.referenceVideos)
    assertMediaLimit('Volcengine Seedream inputImages', media.inputImages, undefined, 16)
    const formats = outputFormatSupport.get(this.key.model)
    if (params.outputFormat && formats && !formats.includes(params.outputFormat)) {
      throw new TaskConfigValidationError(`Volcengine Seedream model ${this.key.model} does not support ${params.outputFormat}.`)
    }
    const sizeLabels = sizeLabelSupport.get(this.key.model)
    if (sizeLabels && !/^\d+x\d+$/.test(params.size) && !sizeLabels.includes(params.size)) {
      throw new TaskConfigValidationError(`Volcengine Seedream model ${this.key.model} does not support size ${params.size}.`)
    }
    if (params.webSearch && this.key.model !== 'doubao-seedream-5-0-260128') {
      throw new TaskConfigValidationError(`Volcengine Seedream model ${this.key.model} does not support webSearch.`)
    }
    return {
      kind: this.key.kind,
      provider: this.key.provider,
      model: this.key.model,
      prompt: input.draft.prompt,
      media: mediaConfigFromEnvelope(media),
      params,
    }
  }

  parseConfig(config: TaskConfig): ParsedTaskConfig<VolcengineSeedreamParams> {
    return parseConfigForModel(this.key, this.paramsSchema, this.prepareConfig({
      draft: config,
      media: mediaEnvelopeFromConfig(config),
    }))
  }

  parseTask(task: ParsedTask<Record<string, unknown>>): ParsedTask<VolcengineSeedreamParams> {
    return {
      ...task,
      config: this.parseConfig(task.config),
    }
  }

  getTaskMode(): 'sync' {
    return 'sync'
  }

  getPricingInput(config: ParsedTaskConfig<VolcengineSeedreamParams>) {
    return {
      taskKind: config.kind,
      provider: config.provider,
      model: config.model,
      pricingKey: `size:${config.params.size}`,
      billingMetric: 'image' as const,
      usageAmount: config.params.count,
    }
  }

  collectInputResources(config: ParsedTaskConfig<VolcengineSeedreamParams>): MediaInput[] {
    return config.media.inputImages
  }

  async start(task: ParsedTask<VolcengineSeedreamParams>): Promise<ProviderStartResult> {
    const upstreamModel = resolveAlias(this.aliases, task.model)
    const response = await this.client.generateImages<VolcengineGeneratedImage[]>(
      upstreamModel,
      buildVolcengineSeedreamRequest(task.config.prompt, {
        count: task.config.params.count,
        images: this.collectInputResources(task.config).map((input) => input.url),
        model: upstreamModel,
        optimizePrompt: task.config.params.optimizePrompt,
        responseFormat: 'url',
        size: task.config.params.size,
        webSearch: task.config.params.webSearch,
        ...(task.config.params.maxImages !== undefined ? { maxImages: task.config.params.maxImages } : {}),
        ...(task.config.params.outputFormat ? { outputFormat: task.config.params.outputFormat } : {}),
        ...(task.config.params.sequentialImageGeneration
          ? { sequentialImageGeneration: task.config.params.sequentialImageGeneration }
          : {}),
        ...(task.config.params.watermark !== undefined ? { watermark: task.config.params.watermark } : {}),
      }),
    )

    return {
      ...(response.usage?.token_count
        ? { actualUsage: { amount: response.usage.token_count, metric: 'token' as const } }
        : {}),
      metadata: {
        upstreamModel,
      },
      output: volcengineSeedreamOutputFromImages(task.id, response.data ?? []),
      status: 'succeeded',
    }
  }

  async poll(): Promise<ProviderPollResult> {
    return {
      code: 'VOLCENGINE_IMAGE_NOT_ASYNC',
      message: 'Volcengine Seedream image tasks are synchronous.',
      status: 'failed',
    }
  }
}

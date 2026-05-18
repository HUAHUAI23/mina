import { z } from 'zod'
import type { MediaInput, TaskConfig } from '@mina/contracts/modules/tasks'

import { apiEnv } from '../../../../../config/env'
import {
  assertMediaLimit,
  assertNoMediaItems,
  collectMediaInputs,
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
import { buildVolcengineSeedanceRequest, volcengineSeedanceOutputFromTask } from './seedance.mapper'

export const VolcengineSeedanceParamsSchema = z.object({
  cameraFixed: z.boolean().optional(),
  durationSeconds: z.number().int().min(1).default(5),
  generateAudio: z.boolean().optional(),
  ratio: z.enum(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']).default('16:9'),
  resolution: z.enum(['480p', '720p', '1080p']).default('720p'),
  returnLastFrame: z.boolean().default(false),
  serviceTier: z.enum(['default', 'flex']).optional(),
  webSearch: z.boolean().default(false),
})

export type VolcengineSeedanceParams = z.infer<typeof VolcengineSeedanceParamsSchema>

const modelCapabilities = new Map<string, {
  audios: number
  cameraFixed: boolean
  duration: { max: number; min: number }
  generateAudio: boolean
  images: number
  returnLastFrame: boolean
  serviceTier: boolean
  supports1080p: boolean
  videos: number
  webSearch: boolean
}>([
  ['doubao-seedance-2-0-260128', { audios: 3, cameraFixed: false, duration: { min: 4, max: 15 }, generateAudio: true, images: 12, returnLastFrame: false, serviceTier: false, supports1080p: false, videos: 3, webSearch: true }],
  ['doubao-seedance-1-5-pro-251215', { audios: 0, cameraFixed: true, duration: { min: 4, max: 12 }, generateAudio: true, images: 2, returnLastFrame: true, serviceTier: true, supports1080p: true, videos: 0, webSearch: false }],
  ['jimeng-video-seedance-2.0', { audios: 3, cameraFixed: false, duration: { min: 4, max: 15 }, generateAudio: true, images: 12, returnLastFrame: false, serviceTier: false, supports1080p: false, videos: 3, webSearch: false }],
  ['jimeng-video-seedance-2.0-fast', { audios: 3, cameraFixed: false, duration: { min: 4, max: 15 }, generateAudio: true, images: 12, returnLastFrame: false, serviceTier: false, supports1080p: false, videos: 3, webSearch: false }],
])

export class VolcengineSeedanceSpec implements ModelSpec<VolcengineSeedanceParams> {
  readonly key: { kind: 'video_generation'; provider: 'volcengine'; model: string }

  readonly paramsSchema = VolcengineSeedanceParamsSchema

  readonly capabilities = {
    media: {
      firstFrame: true,
      lastFrame: true,
      referenceAudios: { max: 3 },
      referenceImages: { max: 12 },
      referenceVideos: { max: 3 },
    },
    output: {
      lastFrame: true,
      video: true,
    },
  } as const

  private readonly aliases: Map<string, string>

  constructor(
    model = 'doubao-seedance-2-0-260128',
    private readonly client = new VolcengineProviderClient(),
    aliases = parseJsonStringMap(apiEnv.volcengineVideoModelAliases),
  ) {
    this.key = {
      kind: 'video_generation',
      provider: 'volcengine',
      model,
    }
    this.aliases = aliases
  }

  prepareConfig(input: PrepareConfigInput): TaskConfig {
    const params = parseParams(this.paramsSchema, input.draft.params)
    const capability = modelCapabilities.get(this.key.model) ?? modelCapabilities.get('doubao-seedance-2-0-260128')
    if (!capability) {
      throw new TaskConfigValidationError(`Unknown Volcengine Seedance model ${this.key.model}.`)
    }
    assertNoMediaItems('Volcengine Seedance inputImages', input.media.inputImages)
    const imageInputCount = input.media.referenceImages.length + (input.media.firstFrame ? 1 : 0) + (input.media.lastFrame ? 1 : 0)
    assertMediaLimit('Volcengine Seedance image inputs', Array.from({ length: imageInputCount }), undefined, capability.images)
    assertMediaLimit('Volcengine Seedance referenceAudios', input.media.referenceAudios, undefined, capability.audios)
    assertMediaLimit('Volcengine Seedance referenceVideos', input.media.referenceVideos, undefined, capability.videos)
    if (params.durationSeconds < capability.duration.min || params.durationSeconds > capability.duration.max) {
      throw new TaskConfigValidationError(`Volcengine Seedance model ${this.key.model} supports duration ${capability.duration.min}-${capability.duration.max} seconds.`)
    }
    if (params.resolution === '1080p' && !capability.supports1080p) {
      throw new TaskConfigValidationError(`Volcengine Seedance model ${this.key.model} does not support 1080p.`)
    }
    if (params.returnLastFrame && !capability.returnLastFrame) {
      throw new TaskConfigValidationError(`Volcengine Seedance model ${this.key.model} does not support returnLastFrame.`)
    }
    if (params.serviceTier && !capability.serviceTier) {
      throw new TaskConfigValidationError(`Volcengine Seedance model ${this.key.model} does not support serviceTier.`)
    }
    if (params.webSearch && !capability.webSearch) {
      throw new TaskConfigValidationError(`Volcengine Seedance model ${this.key.model} does not support webSearch.`)
    }
    if (params.cameraFixed !== undefined && !capability.cameraFixed) {
      throw new TaskConfigValidationError(`Volcengine Seedance model ${this.key.model} does not support cameraFixed.`)
    }
    if (params.generateAudio !== undefined && !capability.generateAudio) {
      throw new TaskConfigValidationError(`Volcengine Seedance model ${this.key.model} does not support generateAudio.`)
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

  parseConfig(config: TaskConfig): ParsedTaskConfig<VolcengineSeedanceParams> {
    return parseConfigForModel(this.key, this.paramsSchema, this.prepareConfig({
      draft: config,
      media: mediaEnvelopeFromConfig(config),
    }))
  }

  parseTask(task: ParsedTask<Record<string, unknown>>): ParsedTask<VolcengineSeedanceParams> {
    return {
      ...task,
      config: this.parseConfig(task.config),
    }
  }

  getTaskMode(): 'async' {
    return 'async'
  }

  getPricingInput(config: ParsedTaskConfig<VolcengineSeedanceParams>) {
    return {
      taskKind: config.kind,
      provider: config.provider,
      model: config.model,
      pricingKey: `resolution:${config.params.resolution}`,
      billingMetric: 'duration_second' as const,
      usageAmount: config.params.durationSeconds,
    }
  }

  collectInputResources(config: ParsedTaskConfig<VolcengineSeedanceParams>): MediaInput[] {
    return collectMediaInputs(config)
  }

  async start(task: ParsedTask<VolcengineSeedanceParams>): Promise<ProviderStartResult> {
    const upstreamModel = resolveAlias(this.aliases, task.model)
    const response = await this.client.createVideoTask(
      upstreamModel,
      buildVolcengineSeedanceRequest(task.config.prompt, {
        durationSeconds: task.config.params.durationSeconds,
        media: this.collectInputResources(task.config).map((input) => ({
          kind: input.kind,
          role: input.role,
          url: input.url,
        })),
        model: upstreamModel,
        ratio: task.config.params.ratio,
        resolution: task.config.params.resolution,
        returnLastFrame: task.config.params.returnLastFrame,
        webSearch: task.config.params.webSearch,
        ...(task.config.params.cameraFixed !== undefined ? { cameraFixed: task.config.params.cameraFixed } : {}),
        ...(task.config.params.generateAudio !== undefined ? { generateAudio: task.config.params.generateAudio } : {}),
        ...(task.config.params.serviceTier ? { serviceTier: task.config.params.serviceTier } : {}),
      }),
    )

    return {
      externalTaskId: response.id,
      metadata: {
        upstreamModel,
      },
      providerStatus: 'submitted',
      status: 'submitted',
    }
  }

  async poll(task: ParsedTask<VolcengineSeedanceParams>): Promise<ProviderPollResult> {
    if (!task.externalTaskId) {
      return {
        code: 'VOLCENGINE_TASK_ID_MISSING',
        message: 'Volcengine Seedance task is missing a provider task id.',
        status: 'failed',
      }
    }

    const upstreamModel = resolveAlias(this.aliases, task.model)
    const response = await this.client.getVideoTask(task.externalTaskId, upstreamModel)
    if (response.status === 'queued' || response.status === 'running') {
      return {
        providerStatus: response.status,
        status: 'pending',
      }
    }
    if (response.status === 'cancelled') {
      return {
        providerStatus: response.status,
        status: 'cancelled',
      }
    }
    if (response.status === 'failed' || response.status === 'expired') {
      return {
        code: response.error?.code ?? `VOLCENGINE_${response.status.toUpperCase()}`,
        message: response.error?.message ?? `Volcengine Seedance task ${response.status}.`,
        providerStatus: response.status,
        status: 'failed',
      }
    }
    return {
      ...(response.usage?.total_tokens
        ? { actualUsage: { amount: response.usage.total_tokens, metric: 'token' as const } }
        : {}),
      output: volcengineSeedanceOutputFromTask(task.id, response),
      providerStatus: response.status,
      status: 'succeeded',
    }
  }
}

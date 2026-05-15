import { z } from 'zod'
import type { NodeOutputResource, TaskConfig } from '@mina/contracts/modules/tasks'

import { collectMediaInputs, mediaConfigFromEnvelope, mediaEnvelopeFromConfig, parseConfigForModel, parseParams } from '../../models/model-spec-base'
import type { ModelSpec, ParsedTask, ParsedTaskConfig, PrepareConfigInput } from '../../models/model-spec'
import type { ProviderPollResult, ProviderStartResult } from '../provider'
import { buildVariables, outputUrl } from './utils'

export const DevVideoParamsSchema = z.object({
  resolution: z.string().min(1).default('720p'),
  durationSeconds: z.number().int().min(1).default(5),
  outputLastFrame: z.boolean().default(false),
})

export type DevVideoParams = z.infer<typeof DevVideoParamsSchema>

export class DevVideoSpec implements ModelSpec<DevVideoParams> {
  readonly key = {
    kind: 'video_generation',
    provider: 'dev',
    model: 'dev-video',
  } as const

  readonly paramsSchema = DevVideoParamsSchema

  readonly capabilities = {
    media: {
      firstFrame: true,
      inputImages: { max: 16 },
      lastFrame: true,
      referenceAudios: { max: 16 },
      referenceImages: { max: 16 },
      referenceVideos: { max: 16 },
    },
    output: {
      lastFrame: true,
      video: true,
    },
  } as const

  prepareConfig(input: PrepareConfigInput): TaskConfig {
    const params = parseParams(this.paramsSchema, input.draft.params)
    return {
      kind: this.key.kind,
      provider: this.key.provider,
      model: this.key.model,
      prompt: input.draft.prompt,
      media: mediaConfigFromEnvelope(input.media),
      params,
    }
  }

  parseConfig(config: TaskConfig): ParsedTaskConfig<DevVideoParams> {
    return parseConfigForModel(this.key, this.paramsSchema, this.prepareConfig({
      draft: config,
      media: mediaEnvelopeFromConfig(config),
    }))
  }

  parseTask(task: ParsedTask<Record<string, unknown>>): ParsedTask<DevVideoParams> {
    return {
      ...task,
      config: this.parseConfig(task.config),
    }
  }

  getTaskMode(): 'async' {
    return 'async'
  }

  getPricingInput(config: ParsedTaskConfig<DevVideoParams>) {
    return {
      taskKind: config.kind,
      provider: config.provider,
      model: config.model,
      pricingKey: `resolution:${config.params.resolution}`,
      billingMetric: 'duration_second' as const,
      usageAmount: config.params.durationSeconds,
    }
  }

  collectInputResources(config: ParsedTaskConfig<DevVideoParams>) {
    return collectMediaInputs(config)
  }

  async start(task: ParsedTask<DevVideoParams>): Promise<ProviderStartResult> {
    return {
      externalTaskId: `external_${task.id}`,
      providerStatus: 'submitted',
      status: 'submitted',
    }
  }

  async poll(task: ParsedTask<DevVideoParams>): Promise<ProviderPollResult> {
    const resources: NodeOutputResource[] = [
      {
        id: `${task.id}:video:0`,
        kind: 'video' as const,
        role: 'generated_video' as const,
        index: 0,
        url: outputUrl(task.id, 0, 'mp4'),
      },
    ]

    if (task.config.params.outputLastFrame) {
      resources.push({
        id: `${task.id}:last-frame:0`,
        kind: 'image' as const,
        role: 'last_frame' as const,
        index: 1,
        url: outputUrl(task.id, 1, 'png'),
      })
    }

    return {
      output: {
        resources,
        variables: buildVariables(resources),
      },
      status: 'succeeded',
    }
  }
}

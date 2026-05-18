import { z } from 'zod'
import type { TaskConfig } from '@mina/contracts/modules/tasks'

import { mediaConfigFromEnvelope, mediaEnvelopeFromConfig, parseConfigForModel, parseParams } from '../../models/model-spec-base'
import type { ModelSpec, ParsedTask, ParsedTaskConfig, PrepareConfigInput } from '../../models/model-spec'
import type { ProviderPollResult, ProviderStartResult } from '../provider'
import { buildVariables, outputUrl } from './utils'

export const DevImageParamsSchema = z.object({
  size: z.string().min(1).default('1024x1024'),
  count: z.number().int().min(1).max(16).default(1),
})

export type DevImageParams = z.infer<typeof DevImageParamsSchema>

export class DevImageSpec implements ModelSpec<DevImageParams> {
  readonly key = {
    kind: 'image_generation',
    provider: 'dev',
    model: 'dev-image',
  } as const

  readonly paramsSchema = DevImageParamsSchema

  readonly capabilities = {
    media: {
      inputImages: { max: 16 },
    },
    output: {
      images: true,
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

  parseConfig(config: TaskConfig): ParsedTaskConfig<DevImageParams> {
    return parseConfigForModel(this.key, this.paramsSchema, this.prepareConfig({
      draft: config,
      media: mediaEnvelopeFromConfig(config),
    }))
  }

  parseTask(task: ParsedTask<Record<string, unknown>>): ParsedTask<DevImageParams> {
    return {
      ...task,
      config: this.parseConfig(task.config),
    }
  }

  getTaskMode(): 'sync' {
    return 'sync'
  }

  getPricingInput(config: ParsedTaskConfig<DevImageParams>) {
    return {
      taskKind: config.kind,
      provider: config.provider,
      model: config.model,
      billingMetric: 'image' as const,
      usageAmount: config.params.count,
    }
  }

  collectInputResources(config: ParsedTaskConfig<DevImageParams>) {
    return config.media.inputImages
  }

  async start(task: ParsedTask<DevImageParams>): Promise<ProviderStartResult> {
    const resources = Array.from({ length: task.config.params.count }, (_unused, index) => ({
      id: `${task.id}:image:${index}`,
      kind: 'image' as const,
      role: 'generated_image' as const,
      index,
      url: outputUrl(task.id, index, 'png'),
    }))

    return {
      output: {
        resources,
        variables: buildVariables(resources),
      },
      status: 'succeeded',
    }
  }

  async poll(): Promise<ProviderPollResult> {
    return {
      code: 'DEV_IMAGE_NOT_ASYNC',
      message: 'Dev image tasks are synchronous.',
      status: 'failed',
    }
  }
}

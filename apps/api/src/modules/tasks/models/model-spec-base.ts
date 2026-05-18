import { z } from 'zod'
import type { MediaInput, TaskConfig } from '@mina/contracts/modules/tasks'

import type { MediaEnvelope } from '../config/media-envelope'
import { TaskConfigValidationError } from '../config/validation-error'
import type { ModelKey } from './model-key'
import type { ParsedTaskConfig } from './model-spec'

export const formatZodError = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join('.') || 'params'}: ${issue.message}`).join('; ')

export const parseParams = <TParams extends Record<string, unknown>>(
  schema: z.ZodType<TParams>,
  params: Record<string, unknown>,
): TParams => {
  const parsed = schema.safeParse(params)
  if (!parsed.success) {
    throw new TaskConfigValidationError(formatZodError(parsed.error))
  }
  return parsed.data
}

export const parseConfigForModel = <TParams extends Record<string, unknown>>(
  key: ModelKey,
  schema: z.ZodType<TParams>,
  config: TaskConfig,
): ParsedTaskConfig<TParams> => {
  if (config.kind !== key.kind || config.provider !== key.provider || config.model !== key.model) {
    throw new TaskConfigValidationError(`Task config does not match ${key.kind}/${key.provider}/${key.model}.`)
  }
  return {
    ...config,
    params: parseParams(schema, config.params),
  }
}

export const mediaConfigFromEnvelope = (media: MediaEnvelope): TaskConfig['media'] => ({
  inputImages: [...media.inputImages],
  ...(media.firstFrame ? { firstFrame: media.firstFrame } : {}),
  ...(media.lastFrame ? { lastFrame: media.lastFrame } : {}),
  referenceImages: [...media.referenceImages],
  referenceAudios: [...media.referenceAudios],
  referenceVideos: [...media.referenceVideos],
})

export const mediaEnvelopeFromConfig = (config: TaskConfig): MediaEnvelope => ({
  inputImages: [...config.media.inputImages],
  ...(config.media.firstFrame ? { firstFrame: config.media.firstFrame } : {}),
  ...(config.media.lastFrame ? { lastFrame: config.media.lastFrame } : {}),
  referenceImages: [...config.media.referenceImages],
  referenceAudios: [...config.media.referenceAudios],
  referenceVideos: [...config.media.referenceVideos],
})

export const collectMediaInputs = (config: TaskConfig): MediaInput[] => [
  ...config.media.inputImages,
  ...(config.media.firstFrame ? [config.media.firstFrame] : []),
  ...(config.media.lastFrame ? [config.media.lastFrame] : []),
  ...config.media.referenceImages,
  ...config.media.referenceAudios,
  ...config.media.referenceVideos,
]

export const assertMediaLimit = (name: string, values: readonly unknown[], min: number | undefined, max: number): void => {
  if (min !== undefined && values.length < min) {
    throw new TaskConfigValidationError(`${name} requires at least ${min} item(s).`)
  }
  if (values.length > max) {
    throw new TaskConfigValidationError(`${name} supports at most ${max} item(s).`)
  }
}

export const assertNoMediaItems = (name: string, values: readonly unknown[]): void => {
  if (values.length > 0) {
    throw new TaskConfigValidationError(`${name} is not supported by this model.`)
  }
}

export const assertNoMediaItem = (name: string, value: unknown): void => {
  if (value !== undefined) {
    throw new TaskConfigValidationError(`${name} is not supported by this model.`)
  }
}

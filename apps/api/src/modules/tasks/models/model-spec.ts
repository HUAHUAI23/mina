import type { PricingEstimateRequest } from '@mina/contracts/modules/pricing'
import type { MediaInput, Task, TaskConfig, TaskKind, TaskMode } from '@mina/contracts/modules/tasks'
import type { z } from 'zod'

import type { MediaEnvelope } from '../config/media-envelope'
import type { TaskDraftConfig } from '../config/task-config'
import type { ProviderPollResult, ProviderStartResult } from '../providers/provider'
import type { ModelKey } from './model-key'

export interface MediaLimit {
  min?: number
  max: number
}

export interface ModelCapabilities {
  media: {
    inputImages?: MediaLimit
    firstFrame?: boolean
    lastFrame?: boolean
    referenceImages?: MediaLimit
    referenceAudios?: MediaLimit
    referenceVideos?: MediaLimit
  }
  output: {
    images?: boolean
    video?: boolean
    lastFrame?: boolean
  }
}

export interface PrepareConfigInput {
  draft: TaskDraftConfig
  media: MediaEnvelope
}

export type ParsedTaskConfig<TParams extends Record<string, unknown>> = TaskConfig & { params: TParams }
export type ParsedTask<TParams extends Record<string, unknown>> = Task & {
  config: ParsedTaskConfig<TParams>
}

export interface ModelSpec<TParams extends Record<string, unknown> = Record<string, unknown>> {
  readonly capabilities: ModelCapabilities
  readonly key: ModelKey
  readonly paramsSchema: z.ZodType<TParams>

  cancel?(task: ParsedTask<TParams>): Promise<void>
  collectInputResources(config: ParsedTaskConfig<TParams>): MediaInput[]
  getPricingInput(config: ParsedTaskConfig<TParams>): PricingEstimateRequest
  getTaskMode(config: ParsedTaskConfig<TParams>): TaskMode
  parseConfig(config: TaskConfig): ParsedTaskConfig<TParams>
  parseTask(task: Task): ParsedTask<TParams>
  poll(task: ParsedTask<TParams>): Promise<ProviderPollResult>
  prepareConfig(input: PrepareConfigInput): TaskConfig
  start(task: ParsedTask<TParams>): Promise<ProviderStartResult>
}

export const assertDraftMatchesSpec = (draft: TaskDraftConfig, key: ModelKey): void => {
  if (draft.kind !== key.kind || draft.provider !== key.provider || draft.model !== key.model) {
    throw new Error(`Draft config does not match model spec ${key.kind}/${key.provider}/${key.model}.`)
  }
}

export const assertConfigMatchesSpec = (config: TaskConfig, key: ModelKey): void => {
  if (config.kind !== key.kind || config.provider !== key.provider || config.model !== key.model) {
    throw new Error(`Task config does not match model spec ${key.kind}/${key.provider}/${key.model}.`)
  }
}

export const taskKindFromModelKey = (key: ModelKey): TaskKind => key.kind

import type { ComponentType } from 'react'
import type { TaskKind } from '@mina/contracts/modules/tasks'
import type { NodeMediaSlots } from '@mina/contracts/modules/media'
import type { z } from 'zod'

import type { TaskParams } from '../model-form-utils'
import type { NodeTaskFormApi } from '../form-context'

export type GenerationMode = 't2i' | 'i2i' | 't2v' | 'i2v'
export type ModelCompatibilityMode = 'text' | 'media'

export interface ModelKey {
  kind: TaskKind
  model: string
  provider: string
}

export interface ImageInputLimit {
  max: number
  min?: number
}

export interface ClientModelMediaCapabilities {
  firstFrame?: boolean
  inputImages?: ImageInputLimit
  lastFrame?: boolean
  referenceAudios?: ImageInputLimit
  referenceImages?: ImageInputLimit
  referenceVideos?: ImageInputLimit
}

export interface ClientModelSpec<TParams extends TaskParams = TaskParams> {
  AdvancedFields?: ComponentType<{ form: NodeTaskFormApi }>
  BasicFields?: ComponentType<{ form: NodeTaskFormApi }>
  defaults: Partial<TParams>
  displayName: string
  key: ModelKey
  mediaCapabilities: ClientModelMediaCapabilities
  paramKeys?: readonly string[]
  paramsSchema?: z.ZodType<TParams>
  supportsMedia: boolean
  supportsText: boolean
}

const registry = new Map<string, ClientModelSpec>()

export const modelKey = (key: Pick<ModelKey, 'kind' | 'model' | 'provider'>): string =>
  `${key.kind}:${key.provider}:${key.model}`

export const registerClientModel = (spec: ClientModelSpec): void => {
  const key = modelKey(spec.key)
  if (registry.has(key)) {
    throw new Error(`Duplicate client model registration: ${key}`)
  }
  registry.set(key, spec)
}

export const resolveClientModel = (key: ModelKey): ClientModelSpec | undefined =>
  registry.get(modelKey(key))

export const listClientModels = (kind: TaskKind, mode: ModelCompatibilityMode): ClientModelSpec[] =>
  [...registry.values()].filter(
    (spec) => spec.key.kind === kind && (mode === 'media' ? spec.supportsMedia : spec.supportsText),
  )

export const listAllClientModels = (kind?: TaskKind): ClientModelSpec[] =>
  [...registry.values()].filter((spec) => !kind || spec.key.kind === kind)

export const deriveModelCompatibilityMode = (mediaSlots: NodeMediaSlots | undefined): ModelCompatibilityMode => {
  const hasMedia = Object.values(mediaSlots ?? {}).some((items) => (items?.length ?? 0) > 0)
  return hasMedia ? 'media' : 'text'
}

export const deriveGenerationMode = (kind: TaskKind, mediaSlots: NodeMediaSlots | undefined): GenerationMode => {
  const mode = deriveModelCompatibilityMode(mediaSlots)
  if (kind === 'video_generation') {
    return mode === 'media' ? 'i2v' : 't2v'
  }
  return mode === 'media' ? 'i2i' : 't2i'
}

const schemaParamKeys = (spec: ClientModelSpec): string[] => {
  const shape = (spec.paramsSchema as { shape?: unknown } | undefined)?.shape
  return shape && typeof shape === 'object' ? Object.keys(shape) : []
}

export const paramsForSpec = (previousParams: TaskParams, spec: ClientModelSpec): TaskParams => {
  const keys = new Set(spec.paramKeys ?? schemaParamKeys(spec))
  const next: TaskParams = {}
  for (const [key, value] of Object.entries(spec.defaults)) {
    if (keys.size === 0 || keys.has(key)) {
      next[key] = value
    }
  }
  for (const [key, value] of Object.entries(previousParams)) {
    if (keys.size === 0 || keys.has(key)) {
      next[key] = value
    }
  }
  return next
}

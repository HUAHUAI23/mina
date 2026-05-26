import { createContext, useContext, useMemo, type ComponentType, type PropsWithChildren } from 'react'
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
  AdvancedFields?: ComponentType<{ fields: 'params'; form: NodeTaskFormApi }>
  BasicFields?: ComponentType<{ fields: 'params'; form: NodeTaskFormApi }>
  defaults: Partial<TParams>
  displayName: string
  key: ModelKey
  mediaCapabilities: ClientModelMediaCapabilities
  /**
   * Use only when a model intentionally exposes a strict subset of paramsSchema.
   * The registry validates the override against the schema shape at registration.
   */
  paramKeysOverride?: readonly string[]
  paramsSchema?: z.ZodType<TParams>
  supportsMedia: boolean
  supportsText: boolean
}

export interface ClientModelRegistry {
  listAll(kind?: TaskKind): ClientModelSpec[]
  listModels(kind: TaskKind, mode: ModelCompatibilityMode): ClientModelSpec[]
  register(spec: ClientModelSpec): void
  resolve(key: ModelKey): ClientModelSpec | undefined
}

export const modelKey = (key: Pick<ModelKey, 'kind' | 'model' | 'provider'>): string =>
  `${key.kind}:${key.provider}:${key.model}`

export const createClientModelRegistry = (initialSpecs: readonly ClientModelSpec[] = []): ClientModelRegistry => {
  const registry = new Map<string, ClientModelSpec>()
  const api: ClientModelRegistry = {
    listAll: (kind) =>
      [...registry.values()].filter((spec) => !kind || spec.key.kind === kind),
    listModels: (kind, mode) =>
      [...registry.values()].filter(
        (spec) => spec.key.kind === kind && (mode === 'media' ? spec.supportsMedia : spec.supportsText),
      ),
    register: (spec) => {
      const key = modelKey(spec.key)
      if (registry.has(key)) {
        throw new Error(`Duplicate client model registration: ${key}`)
      }
      assertParamKeysOverride(spec)
      registry.set(key, spec)
    },
    resolve: (key) => registry.get(modelKey(key)),
  }
  for (const spec of initialSpecs) {
    api.register(spec)
  }
  return api
}

const defaultRegistry = createClientModelRegistry()
const ClientModelRegistryContext = createContext<ClientModelRegistry | undefined>(undefined)

export function ClientModelRegistryProvider({
  children,
  registry,
  specs,
}: PropsWithChildren<{
  registry?: ClientModelRegistry | undefined
  specs?: readonly ClientModelSpec[] | undefined
}>) {
  const value = useMemo(
    () => registry ?? createClientModelRegistry(specs),
    [registry, specs],
  )

  return (
    <ClientModelRegistryContext.Provider value={value}>
      {children}
    </ClientModelRegistryContext.Provider>
  )
}

export const useClientModelRegistry = (): ClientModelRegistry => {
  const registry = useContext(ClientModelRegistryContext)
  if (!registry) {
    return defaultRegistry
  }
  return registry
}

export const registerClientModel = (spec: ClientModelSpec): void => defaultRegistry.register(spec)

export const resolveClientModel = (key: ModelKey): ClientModelSpec | undefined =>
  defaultRegistry.resolve(key)

export const listClientModels = (kind: TaskKind, mode: ModelCompatibilityMode): ClientModelSpec[] =>
  defaultRegistry.listModels(kind, mode)

export const listAllClientModels = (kind?: TaskKind): ClientModelSpec[] =>
  defaultRegistry.listAll(kind)

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

const assertParamKeysOverride = (spec: ClientModelSpec): void => {
  if (!spec.paramKeysOverride) {
    return
  }
  const schemaKeys = schemaParamKeys(spec)
  if (schemaKeys.length === 0) {
    return
  }
  const schemaKeySet = new Set(schemaKeys)
  const unknownKeys = spec.paramKeysOverride.filter((key) => !schemaKeySet.has(key))
  if (unknownKeys.length > 0) {
    throw new Error(`Client model ${modelKey(spec.key)} declares params outside its schema: ${unknownKeys.join(', ')}`)
  }
}

export const paramsForSpec = (previousParams: TaskParams, spec: ClientModelSpec): TaskParams => {
  const keys = new Set(spec.paramKeysOverride ?? schemaParamKeys(spec))
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

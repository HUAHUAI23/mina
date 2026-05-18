import type { TaskModelDescriptor, TaskModelField } from '@mina/contracts/modules/tasks/model-catalog'

import type { ModelRegistry } from './model-registry'
import type { ModelSpec } from './model-spec'

const titleCase = (value: string): string =>
  value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const optionField = (
  key: string,
  values: readonly string[],
  defaultValue: string | undefined,
  section: TaskModelField['section'] = 'basic',
): TaskModelField => ({
  key,
  label: titleCase(key),
  kind: 'select',
  section,
  ...(defaultValue ? { defaultValue } : {}),
  options: values.map((value) => ({ label: value, value })),
})

const fieldMetadata = (key: string): TaskModelField | undefined => {
  if (key === 'count') {
    return { key, label: 'Count', kind: 'integer', section: 'basic', defaultValue: 1, min: 1, max: 16, step: 1 }
  }
  if (key === 'size') {
    return optionField(key, ['1024x1024'], '1024x1024')
  }
  if (key === 'resolution') {
    return optionField(key, ['720p', '1080p', '4k'], '720p')
  }
  if (key === 'durationSeconds') {
    return { key, label: 'Duration', kind: 'integer', section: 'basic', defaultValue: 5, min: 1, max: 12, step: 1 }
  }
  if (key === 'aspectRatio') {
    return optionField(key, ['1:1', '3:2', '4:3', '9:16', '16:9', '21:9'], '1:1')
  }
  if (key === 'imageSize') {
    return optionField(key, ['512', '1K', '2K', '4K'], '1K')
  }
  if (key === 'personGeneration') {
    return optionField(key, ['allow_all', 'allow_adult'], 'allow_all', 'advanced')
  }
  if (key === 'outputLastFrame' || key === 'imageSearch' || key === 'includeThoughts' || key === 'webSearch') {
    return { key, label: titleCase(key), kind: 'boolean', section: 'advanced', defaultValue: false }
  }
  if (key === 'thinkingLevel') {
    return optionField(key, ['minimal', 'high'], undefined, 'advanced')
  }
  return undefined
}

const defaultFieldsForSpec = (spec: ModelSpec): TaskModelField[] => {
  const shape = (spec.paramsSchema as { shape?: unknown }).shape
  if (!shape || typeof shape !== 'object') {
    return []
  }
  return Object.keys(shape)
    .map(fieldMetadata)
    .filter((field): field is TaskModelField => Boolean(field))
}

const defaultDisplayName = (spec: ModelSpec): string => `${titleCase(spec.key.provider)} ${titleCase(spec.key.model)}`

export class TaskModelCatalogService {
  constructor(private readonly modelRegistry: ModelRegistry) {}

  listDescriptors(): TaskModelDescriptor[] {
    return this.modelRegistry.list().map((spec) => ({
      capabilities: spec.capabilities,
      defaults: spec.publicDescriptor?.defaults ?? {},
      displayName: spec.publicDescriptor?.displayName ?? defaultDisplayName(spec),
      fields: spec.publicDescriptor?.fields ?? defaultFieldsForSpec(spec),
      kind: spec.key.kind,
      model: spec.key.model,
      provider: spec.key.provider,
    }))
  }
}

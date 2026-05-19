import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'
import type { TaskModelDescriptor, TaskModelField } from '@mina/contracts/modules/tasks/model-catalog'
import type { NodeMediaSlots } from '@mina/contracts/modules/media'

export type TaskParamValue = TaskDraftConfig['params'][string]
export type TaskParams = TaskDraftConfig['params']

export interface NodeTaskFormValue {
  kind: TaskDraftConfig['kind']
  mediaSlots: NodeMediaSlots
  model: string
  params: TaskParams
  prompt: string
  provider: string
}

export const taskToFormValue = (task: TaskDraftConfig, mediaSlots: NodeMediaSlots = {}): NodeTaskFormValue => ({
  kind: task.kind,
  mediaSlots,
  model: task.model,
  params: { ...task.params },
  prompt: task.prompt,
  provider: task.provider,
})

export const formValueToTask = (value: NodeTaskFormValue): TaskDraftConfig => ({
  kind: value.kind,
  model: value.model,
  params: { ...value.params },
  prompt: value.prompt,
  provider: value.provider,
})

export const fieldValue = (field: TaskModelField): TaskParamValue => {
  if (field.defaultValue !== undefined) {
    return field.defaultValue
  }
  if (field.kind === 'boolean') {
    return false
  }
  if (field.kind === 'number' || field.kind === 'integer' || field.kind === 'slider') {
    return field.min ?? 0
  }
  return field.options?.[0]?.value ?? ''
}

export const paramsForModel = (
  previousParams: TaskParams,
  model: TaskModelDescriptor,
): TaskParams => {
  const next: TaskParams = {}
  const supportedKeys = new Set(model.fields.map((field) => field.key))
  for (const field of model.fields) {
    next[field.key] = Object.hasOwn(previousParams, field.key)
      ? previousParams[field.key]
      : Object.hasOwn(model.defaults, field.key)
        ? model.defaults[field.key]
        : fieldValue(field)
  }
  for (const [key, value] of Object.entries(model.defaults)) {
    if (!supportedKeys.has(key)) {
      next[key] = value
    }
  }
  return next
}

export const compatibleModels = (
  models: readonly TaskModelDescriptor[],
  kind: TaskDraftConfig['kind'],
): TaskModelDescriptor[] => models.filter((model) => model.kind === kind)

export const modelKey = (model: Pick<TaskModelDescriptor, 'model' | 'provider'>): string => `${model.provider}:${model.model}`

export const activeModelForTask = (
  models: readonly TaskModelDescriptor[],
  task: Pick<TaskDraftConfig, 'kind' | 'model' | 'provider'>,
): TaskModelDescriptor | undefined =>
  models.find((model) => model.kind === task.kind && model.provider === task.provider && model.model === task.model)

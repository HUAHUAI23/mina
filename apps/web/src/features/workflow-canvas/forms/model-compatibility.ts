import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'
import type { NodeMediaSlots } from '@mina/contracts/modules/media'

import {
  deriveModelCompatibilityMode,
  listClientModels,
  paramsForSpec,
  resolveClientModel,
  type ClientModelSpec,
} from './registry/client-model-registry'
import './registry'
import { formValueToTask, taskToFormValue, type NodeTaskFormValue } from './model-form-utils'

export const defaultPromptForKind = (kind: TaskDraftConfig['kind']): string =>
  kind === 'video_generation' ? 'Describe the motion' : 'Describe the image'

export const formValueForSpec = (
  spec: ClientModelSpec,
  previous?: Pick<NodeTaskFormValue, 'params' | 'prompt'> | undefined,
): NodeTaskFormValue => ({
  kind: spec.key.kind,
  model: spec.key.model,
  params: paramsForSpec(previous?.params ?? {}, spec),
  prompt: previous?.prompt ?? defaultPromptForKind(spec.key.kind),
  provider: spec.key.provider,
})

export const defaultFormValueForKind = (
  kind: TaskDraftConfig['kind'],
  mediaSlots: NodeMediaSlots,
): NodeTaskFormValue => {
  const [spec] = listClientModels(kind, deriveModelCompatibilityMode(mediaSlots))
  if (!spec) {
    return {
      kind,
      model: '',
      params: {},
      prompt: defaultPromptForKind(kind),
      provider: '',
    }
  }
  return formValueForSpec(spec)
}

export const isSpecCompatibleWithMedia = (spec: ClientModelSpec, mediaSlots: NodeMediaSlots): boolean =>
  deriveModelCompatibilityMode(mediaSlots) === 'media' ? spec.supportsMedia : spec.supportsText

export const taskWithCompatibleModel = (task: TaskDraftConfig, mediaSlots: NodeMediaSlots): TaskDraftConfig => {
  const currentSpec = resolveClientModel({ kind: task.kind, provider: task.provider, model: task.model })
  if (currentSpec && isSpecCompatibleWithMedia(currentSpec, mediaSlots)) {
    return task
  }
  const [fallback] = listClientModels(task.kind, deriveModelCompatibilityMode(mediaSlots))
  if (!fallback) {
    return task
  }
  return formValueToTask(formValueForSpec(fallback, { params: task.params, prompt: task.prompt }))
}

export const formValueWithCompatibleModel = (
  value: NodeTaskFormValue,
  mediaSlots: NodeMediaSlots,
): NodeTaskFormValue => taskToFormValue(taskWithCompatibleModel(formValueToTask(value), mediaSlots))

export const formValuesEqual = (left: NodeTaskFormValue, right: NodeTaskFormValue): boolean =>
  tasksEqual(formValueToTask(left), formValueToTask(right))

export const tasksEqual = (left: TaskDraftConfig, right: TaskDraftConfig): boolean => {
  if (left.kind !== right.kind || left.provider !== right.provider || left.model !== right.model || left.prompt !== right.prompt) {
    return false
  }
  const leftKeys = Object.keys(left.params).sort()
  const rightKeys = Object.keys(right.params).sort()
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  return leftKeys.every((key, index) => key === rightKeys[index] && Object.is(left.params[key], right.params[key]))
}

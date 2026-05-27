import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'
import type { NodeMediaSlots } from '@mina/contracts/modules/media'

import { baseMessages, type WebMessages } from '../../../lib/i18n-messages'
import {
  deriveModelCompatibilityMode,
  listClientModels,
  paramsForSpec,
  resolveClientModel,
  type ClientModelSpec,
} from './registry/client-model-registry'
import './registry'
import { formValueToTask, taskToFormValue, type NodeTaskFormValue } from './model-form-utils'

export const defaultPromptForKind = (kind: TaskDraftConfig['kind'], m: WebMessages = baseMessages): string =>
  kind === 'video_generation' ? m.workflow_canvas_prompt_placeholder_video() : m.workflow_canvas_prompt_placeholder_image()

export const formValueForSpec = (
  spec: ClientModelSpec,
  m: WebMessages = baseMessages,
  previous?: Pick<NodeTaskFormValue, 'params' | 'prompt'> | undefined,
): NodeTaskFormValue => ({
  kind: spec.key.kind,
  model: spec.key.model,
  params: paramsForSpec(previous?.params ?? {}, spec),
  prompt: previous?.prompt ?? defaultPromptForKind(spec.key.kind, m),
  provider: spec.key.provider,
})

export const defaultFormValueForKind = (
  kind: TaskDraftConfig['kind'],
  mediaSlots: NodeMediaSlots,
  m: WebMessages = baseMessages,
): NodeTaskFormValue => {
  const [spec] = listClientModels(kind, deriveModelCompatibilityMode(mediaSlots))
  if (!spec) {
    return {
      kind,
      model: '',
      params: {},
      prompt: defaultPromptForKind(kind, m),
      provider: '',
    }
  }
  return formValueForSpec(spec, m)
}

export const isSpecCompatibleWithMedia = (spec: ClientModelSpec, mediaSlots: NodeMediaSlots): boolean =>
  deriveModelCompatibilityMode(mediaSlots) === 'media' ? spec.supportsMedia : spec.supportsText

export const taskWithCompatibleModel = (task: TaskDraftConfig, mediaSlots: NodeMediaSlots, m: WebMessages = baseMessages): TaskDraftConfig => {
  const currentSpec = resolveClientModel({ kind: task.kind, provider: task.provider, model: task.model })
  if (currentSpec && isSpecCompatibleWithMedia(currentSpec, mediaSlots)) {
    return task
  }
  const [fallback] = listClientModels(task.kind, deriveModelCompatibilityMode(mediaSlots))
  if (!fallback) {
    return task
  }
  return formValueToTask(formValueForSpec(fallback, m, { params: task.params, prompt: task.prompt }))
}

export const formValueWithCompatibleModel = (
  value: NodeTaskFormValue,
  mediaSlots: NodeMediaSlots,
  m: WebMessages = baseMessages,
): NodeTaskFormValue => taskToFormValue(taskWithCompatibleModel(formValueToTask(value), mediaSlots, m))

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

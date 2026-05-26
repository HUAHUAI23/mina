import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

export type TaskParams = TaskDraftConfig['params']

interface NodeTaskFormBaseValue<TKind extends TaskDraftConfig['kind']> {
  kind: TKind
  model: string
  params: TaskParams
  prompt: string
  provider: string
}

export type ImageNodeTaskFormValue = NodeTaskFormBaseValue<'image_generation'>
export type VideoNodeTaskFormValue = NodeTaskFormBaseValue<'video_generation'>
export type NodeTaskFormValue = ImageNodeTaskFormValue | VideoNodeTaskFormValue

export const taskToFormValue = (task: TaskDraftConfig): NodeTaskFormValue => ({
  kind: task.kind,
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

import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

export type TaskParams = TaskDraftConfig['params']

export interface NodeTaskFormValue {
  kind: TaskDraftConfig['kind']
  model: string
  params: TaskParams
  prompt: string
  provider: string
}

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

import type { MediaInput, NodeOutputResource, TaskResource } from '@mina/contracts/modules/tasks'

type CreateId = (prefix: string) => string

export const taskResourceFromInput = (
  taskId: string,
  accountId: string,
  input: MediaInput,
  index: number,
  createId: CreateId,
): TaskResource => ({
  id: createId('task_resource'),
  accountId,
  taskId,
  direction: 'input',
  kind: input.kind,
  url: input.url,
  role: input.role,
  outputIndex: index,
  ...(input.metadata ? { metadata: input.metadata } : {}),
})

export const taskResourceFromOutput = (
  taskId: string,
  accountId: string,
  output: NodeOutputResource,
): TaskResource => ({
  id: output.id,
  accountId,
  taskId,
  direction: 'output',
  kind: output.kind,
  url: output.url,
  role: output.role,
  outputIndex: output.index,
  ...(output.metadata ? { metadata: output.metadata } : {}),
})

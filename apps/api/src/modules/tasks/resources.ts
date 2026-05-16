import type { MediaInput, NodeOutputResource, TaskResource } from '@mina/contracts/modules/tasks'
import { MediaSlotNameSchema } from '@mina/contracts/modules/media'

type CreateId = (prefix: string) => string

const slotFromMetadata = (metadata: Record<string, unknown> | undefined): TaskResource['slot'] => {
  const parsed = MediaSlotNameSchema.safeParse(metadata?.slot)
  return parsed.success ? parsed.data : undefined
}

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
  ...(input.mediaObjectId ? { mediaObjectId: input.mediaObjectId } : {}),
  ...(slotFromMetadata(input.metadata) ? { slot: slotFromMetadata(input.metadata) } : {}),
  ...(typeof input.metadata?.slotItemId === 'string' ? { slotItemId: input.metadata.slotItemId } : {}),
  ...(typeof input.metadata?.slotOrder === 'number' ? { slotOrder: input.metadata.slotOrder } : {}),
  ...(input.source ? { source: input.source } : {}),
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
  ...(output.mediaObjectId ? { mediaObjectId: output.mediaObjectId } : {}),
  ...(output.metadata ? { metadata: output.metadata } : {}),
})

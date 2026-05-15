import type { TaskKind } from '@mina/contracts/modules/tasks'

export interface ModelKey {
  kind: TaskKind
  provider: string
  model: string
}

export const modelKey = (key: ModelKey): string => `${key.kind}:${key.provider}:${key.model}`

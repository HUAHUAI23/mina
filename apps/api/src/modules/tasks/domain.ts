import type { TaskConfig, TaskKind, TaskMode } from '@mina/contracts/modules/tasks'

export const taskKindFromConfig = (config: TaskConfig): TaskKind => config.kind

export const taskModeFromKind = (kind: TaskKind): TaskMode => (kind === 'video_generation' ? 'async' : 'sync')

export const providerFromConfig = (config: TaskConfig): string => config.provider

export const modelFromConfig = (config: TaskConfig): string => config.model

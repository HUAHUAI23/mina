import { z } from 'zod'

import { TaskKindSchema } from './task.schemas'

export const TaskModelFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['select', 'number', 'integer', 'boolean', 'slider', 'text']),
  section: z.enum(['basic', 'advanced']).default('advanced'),
  defaultValue: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
})

export const TaskModelDescriptorSchema = z.object({
  kind: TaskKindSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: z.unknown(),
  defaults: z.record(z.string(), z.unknown()).default({}),
  fields: z.array(TaskModelFieldSchema).default([]),
})

export const TaskModelCatalogResponseSchema = z.object({
  items: z.array(TaskModelDescriptorSchema),
})

export type TaskModelCatalogResponse = z.infer<typeof TaskModelCatalogResponseSchema>
export type TaskModelDescriptor = z.infer<typeof TaskModelDescriptorSchema>
export type TaskModelField = z.infer<typeof TaskModelFieldSchema>

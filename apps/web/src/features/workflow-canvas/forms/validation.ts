import { z } from 'zod'

import { resolveClientModel } from './registry/client-model-registry'
import './registry'
import type { NodeTaskFormValue } from './model-form-utils'

const NodeTaskFormValueSchema = z.object({
  kind: z.enum(['image_generation', 'video_generation']),
  model: z.string().min(1, 'Model is required.'),
  params: z.record(z.string(), z.unknown()),
  prompt: z.string(),
  provider: z.string().min(1, 'Provider is required.'),
})

const RunnableNodeTaskFormValueSchema = NodeTaskFormValueSchema.extend({
  prompt: z.string().trim().min(1, 'Prompt is required.'),
})

const validateNodeTaskFormValueWithSchema = (
  value: unknown,
  schema: typeof NodeTaskFormValueSchema,
) => {
  const base = schema.safeParse(value)
  const fieldErrors: Partial<Record<keyof NodeTaskFormValue | 'params', string>> = {}

  if (!base.success) {
    for (const issue of base.error.issues) {
      const field = issue.path[0]
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field as keyof typeof fieldErrors] = issue.message
      }
    }
    return Object.keys(fieldErrors).length ? { fields: fieldErrors } : undefined
  }

  const parsedValue = base.data as NodeTaskFormValue

  const spec = resolveClientModel({
    kind: parsedValue.kind,
    provider: parsedValue.provider,
    model: parsedValue.model,
  })

  if (!spec) {
    fieldErrors.model = 'Model is not registered.'
  } else if (spec.paramsSchema) {
    const params = spec.paramsSchema.safeParse(parsedValue.params)
    if (!params.success) {
      fieldErrors.params = params.error.issues[0]?.message ?? 'Model parameters are invalid.'
    }
  }

  return Object.keys(fieldErrors).length ? { fields: fieldErrors } : undefined
}

export const validateNodeTaskFormDraftValue = ({ value }: { value: unknown }) =>
  validateNodeTaskFormValueWithSchema(value, NodeTaskFormValueSchema)

export const validateNodeTaskFormSubmitValue = ({ value }: { value: unknown }) =>
  validateNodeTaskFormValueWithSchema(value, RunnableNodeTaskFormValueSchema)

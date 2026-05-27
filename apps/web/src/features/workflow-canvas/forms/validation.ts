import { z } from 'zod'

import type { WebMessages } from '../../../lib/i18n-messages'
import { resolveClientModel } from './registry/client-model-registry'
import './registry'
import type { NodeTaskFormValue } from './model-form-utils'

type NodeTaskFormFieldErrors = Partial<Record<keyof NodeTaskFormValue, string>>

export type NodeTaskFormValidationResult = { fields: NodeTaskFormFieldErrors } | undefined
export type NodeTaskFormValidator = (props: { value: NodeTaskFormValue }) => NodeTaskFormValidationResult

const createNodeTaskFormValueSchema = (m: WebMessages) =>
  z.object({
    kind: z.enum(['image_generation', 'video_generation']),
    model: z.string().min(1, m.workflow_canvas_validation_model_required()),
    params: z.record(z.string(), z.unknown()),
    prompt: z.string(),
    provider: z.string().min(1, m.workflow_canvas_validation_provider_required()),
  })

const validateNodeTaskFormValueWithSchema = (
  value: unknown,
  schema: ReturnType<typeof createNodeTaskFormValueSchema>,
  m: WebMessages,
): NodeTaskFormValidationResult => {
  const base = schema.safeParse(value)
  const fieldErrors: NodeTaskFormFieldErrors = {}

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
    fieldErrors.model = m.workflow_canvas_validation_model_not_registered()
  } else if (spec.paramsSchema) {
    const params = spec.paramsSchema.safeParse(parsedValue.params)
    if (!params.success) {
      fieldErrors.params = params.error.issues[0]?.message ?? m.workflow_canvas_validation_model_params_invalid()
    }
  }

  return Object.keys(fieldErrors).length ? { fields: fieldErrors } : undefined
}

export const createNodeTaskValidators = (m: WebMessages) => {
  const nodeTaskFormValueSchema = createNodeTaskFormValueSchema(m)
  const runnableNodeTaskFormValueSchema = nodeTaskFormValueSchema.extend({
    prompt: z.string().trim().min(1, m.workflow_canvas_validation_prompt_required()),
  })

  const onChange: NodeTaskFormValidator = ({ value }) =>
    validateNodeTaskFormValueWithSchema(value, nodeTaskFormValueSchema, m)
  const onSubmit: NodeTaskFormValidator = ({ value }) =>
    validateNodeTaskFormValueWithSchema(value, runnableNodeTaskFormValueSchema, m)

  return { onChange, onSubmit }
}

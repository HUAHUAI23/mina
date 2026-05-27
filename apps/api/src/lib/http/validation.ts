import { sValidator } from '@hono/standard-validator'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ApiValidationIssue } from '@mina/contracts/schemas/api-error'
import type { Env, Input, TypedResponse, ValidationTargets } from 'hono'

import { HttpError } from './http-error'

const issueCodeByMessage = (message: string): string => {
  const lower = message.toLowerCase()
  if (lower.includes('required') || lower.includes('expected')) {
    return 'REQUIRED'
  }
  if (lower.includes('email')) {
    return 'INVALID_EMAIL'
  }
  if (lower.includes('too small') || lower.includes('at least') || lower.includes('minimum')) {
    return 'TOO_SMALL'
  }
  if (lower.includes('too big') || lower.includes('at most') || lower.includes('maximum')) {
    return 'TOO_BIG'
  }
  if (lower.includes('invalid enum') || lower.includes('option')) {
    return 'INVALID_ENUM'
  }
  return 'INVALID'
}

const normalizeIssuePath = (path: readonly (PropertyKey | StandardSchemaV1.PathSegment)[] | undefined): ApiValidationIssue['path'] =>
  path?.flatMap((segment) => {
    const key = typeof segment === 'object' && segment !== null && 'key' in segment ? segment.key : segment
    return typeof key === 'string' || typeof key === 'number' ? [key] : []
  }) ?? []

export const toApiValidationIssues = (issues: readonly StandardSchemaV1.Issue[]): ApiValidationIssue[] =>
  issues.map((issue) => ({
    path: normalizeIssuePath(issue.path),
    code: issueCodeByMessage(issue.message),
    message: issue.message,
  }))

type HasUndefined<T> = undefined extends T ? true : false
type FailedResponse<T> = Response &
  TypedResponse<
    {
      readonly success: false
      readonly error: readonly StandardSchemaV1.Issue[]
      readonly data: T
    },
    400,
    'json'
  >
export const apiValidator = <
  Schema extends StandardSchemaV1,
  Target extends keyof ValidationTargets,
  E extends Env,
  P extends string,
  In = StandardSchemaV1.InferInput<Schema>,
  Out = StandardSchemaV1.InferOutput<Schema>,
  I extends Input = {
    in: HasUndefined<In> extends true
      ? { [K in Target]?: In extends ValidationTargets[K] ? In : { [K2 in keyof In]?: ValidationTargets[K][K2] } }
      : { [K in Target]: In extends ValidationTargets[K] ? In : { [K2 in keyof In]: ValidationTargets[K][K2] } }
    out: { [K in Target]: Out }
  },
  V extends I = I,
>(
  target: Target,
  schema: Schema,
) =>
  sValidator<Schema, Target, E, P, In, Out, I, V, void | FailedResponse<ValidationTargets[Target]>>(
    target,
    schema,
    (result) => {
      if (!result.success) {
        throw new HttpError(400, 'VALIDATION_FAILED', {
          fallbackMessage: 'The request is invalid.',
          issues: toApiValidationIssues(result.error),
          messageKey: 'api_error_validation_failed',
        })
      }
    },
  ) as ReturnType<typeof sValidator<Schema, Target, E, P, In, Out, I, V>>

import { z } from 'zod'

export const SupportedLocaleSchema = z.enum(['en', 'zh-Hans'])

export const ApiErrorParamSchema = z.union([z.string(), z.number(), z.boolean()])

export const ApiValidationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  code: z.string().min(1),
  message: z.string().min(1).optional(),
  params: z.record(z.string(), ApiErrorParamSchema).optional(),
})

export const LocalizedErrorDetailsSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  locale: SupportedLocaleSchema.optional(),
  messageKey: z.string().min(1).optional(),
  params: z.record(z.string(), ApiErrorParamSchema).optional(),
  debugMessage: z.string().min(1).optional(),
})

export const KnownApiErrorCodeSchema = z.enum([
  'ACCOUNT_ACCESS_DENIED',
  'ACCOUNT_AVATAR_NOT_FOUND',
  'ACCOUNT_NOT_INITIALIZED',
  'ADMIN_REQUIRED',
  'AUTH_INVALID_CREDENTIALS',
  'EMAIL_ALREADY_REGISTERED',
  'INTERNAL_SERVER_ERROR',
  'INVALID_CREDENTIALS',
  'MEDIA_FILE_REQUIRED',
  'MEDIA_OBJECT_NOT_FOUND',
  'MEDIA_OBJECT_NOT_READY',
  'MEDIA_OBJECT_NOT_UPLOADING',
  'MEDIA_TYPE_UNSUPPORTED',
  'MEDIA_UPLOAD_KEY_MISMATCH',
  'MEDIA_UPLOAD_TOO_LARGE',
  'NOT_FOUND',
  'PUBLIC_SHARE_REQUEST_NOT_IMPLEMENTED',
  'TASK_CONFIG_INVALID',
  'TASK_PROMPT_REQUIRED',
  'UNAUTHENTICATED',
  'UNAUTHORIZED',
  'USERNAME_ALREADY_REGISTERED',
  'VALIDATION_FAILED',
])

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    locale: SupportedLocaleSchema.optional(),
    params: z.record(z.string(), ApiErrorParamSchema).optional(),
    issues: z.array(ApiValidationIssueSchema).optional(),
  }),
})

export type ApiError = z.infer<typeof ApiErrorSchema>
export type ApiErrorParam = z.infer<typeof ApiErrorParamSchema>
export type ApiValidationIssue = z.infer<typeof ApiValidationIssueSchema>
export type KnownApiErrorCode = z.infer<typeof KnownApiErrorCodeSchema>
export type LocalizedErrorDetails = z.infer<typeof LocalizedErrorDetailsSchema>
export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>

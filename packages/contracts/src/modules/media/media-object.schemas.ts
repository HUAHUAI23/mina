import { z } from 'zod'

export const MediaObjectKindSchema = z.enum(['image', 'video', 'audio', 'file'])
export const MediaObjectStatusSchema = z.enum(['uploading', 'ready', 'failed', 'deleted'])
export const MediaObjectOriginSchema = z.enum(['user_upload', 'task_output', 'external_import', 'system_generated'])
export const MediaObjectPurposeSchema = z.enum([
  'workflow_slot',
  'task_input',
  'temporary',
  'task_output',
  'preview',
  'chat_attachment',
  'public_library',
  'asset_library',
])
export const MediaObjectRetentionSchema = z.enum(['temporary', 'task_scoped', 'project_scoped', 'library'])

export const MediaObjectSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  kind: MediaObjectKindSchema,
  status: MediaObjectStatusSchema,
  bucket: z.string().min(1),
  storageKey: z.string().min(1),
  url: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  origin: MediaObjectOriginSchema,
  purpose: MediaObjectPurposeSchema,
  retention: MediaObjectRetentionSchema,
  parentMediaObjectId: z.string().min(1).optional(),
  sourceTaskId: z.string().min(1).optional(),
  sourceTaskResourceId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const fileKindPurposeIssue = {
  code: 'custom' as const,
  message: 'File media objects are only supported for chat attachments.',
  path: ['purpose'],
}

export const CreateMediaObjectPurposeSchema = z.enum([
  'workflow_slot',
  'task_input',
  'temporary',
  'chat_attachment',
  'public_library',
]).default('workflow_slot')
export const CreateMediaObjectRetentionInputSchema = MediaObjectRetentionSchema.default('project_scoped')

export const CreateMediaObjectSchema = z.object({
  kind: MediaObjectKindSchema.optional(),
  purpose: CreateMediaObjectPurposeSchema,
  retention: CreateMediaObjectRetentionInputSchema,
}).superRefine((value, context) => {
  if (value.kind === 'file' && value.purpose !== 'chat_attachment') {
    context.addIssue(fileKindPurposeIssue)
  }
})

export const MediaObjectResponseSchema = z.object({
  item: MediaObjectSchema,
})

export const CreateMediaObjectResponseSchema = MediaObjectResponseSchema
export const GetMediaObjectResponseSchema = MediaObjectResponseSchema

export const CreatePresignedMediaUploadSchema = z.object({
  kind: MediaObjectKindSchema,
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative().optional(),
  purpose: CreateMediaObjectPurposeSchema,
  retention: CreateMediaObjectRetentionInputSchema,
}).superRefine((value, context) => {
  if (value.kind === 'file' && value.purpose !== 'chat_attachment') {
    context.addIssue(fileKindPurposeIssue)
  }
})

export const CreatePresignedMediaUploadResponseSchema = z.object({
  item: MediaObjectSchema,
  uploadUrl: z.string().min(1),
  storageKey: z.string().min(1),
  expiresAt: z.string().datetime(),
})

export const CompletePresignedMediaUploadSchema = z.object({
  storageKey: z.string().min(1),
})

export type CompletePresignedMediaUploadInput = z.infer<typeof CompletePresignedMediaUploadSchema>
export type CreateMediaObjectInput = z.infer<typeof CreateMediaObjectSchema>
export type CreateMediaObjectResponse = z.infer<typeof CreateMediaObjectResponseSchema>
export type CreatePresignedMediaUploadInput = z.infer<typeof CreatePresignedMediaUploadSchema>
export type CreatePresignedMediaUploadResponse = z.infer<typeof CreatePresignedMediaUploadResponseSchema>
export type GetMediaObjectResponse = z.infer<typeof GetMediaObjectResponseSchema>
export type MediaObject = z.infer<typeof MediaObjectSchema>
export type MediaObjectKind = z.infer<typeof MediaObjectKindSchema>
export type MediaObjectOrigin = z.infer<typeof MediaObjectOriginSchema>
export type MediaObjectPurpose = z.infer<typeof MediaObjectPurposeSchema>
export type MediaObjectResponse = z.infer<typeof MediaObjectResponseSchema>
export type MediaObjectRetention = z.infer<typeof MediaObjectRetentionSchema>
export type MediaObjectStatus = z.infer<typeof MediaObjectStatusSchema>

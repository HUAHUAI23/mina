import { z } from 'zod'

import { ResourceKindSchema } from '../tasks/task.schemas'

export const MediaObjectStatusSchema = z.enum(['uploading', 'ready', 'failed', 'deleted'])
export const MediaObjectOriginSchema = z.enum(['user_upload', 'task_output', 'external_import', 'system_generated'])
export const MediaObjectPurposeSchema = z.enum(['workflow_slot', 'task_input', 'temporary', 'task_output', 'preview', 'public_library'])
export const MediaObjectRetentionSchema = z.enum(['temporary', 'task_scoped', 'project_scoped', 'library'])

export const MediaObjectSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  kind: ResourceKindSchema,
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

export const CreateMediaObjectSchema = z.object({
  kind: ResourceKindSchema.optional(),
  purpose: z.enum(['workflow_slot', 'task_input', 'temporary', 'public_library']).default('workflow_slot'),
  retention: MediaObjectRetentionSchema.default('project_scoped'),
})

export const MediaObjectResponseSchema = z.object({
  item: MediaObjectSchema,
})

export const CreateMediaObjectResponseSchema = MediaObjectResponseSchema
export const GetMediaObjectResponseSchema = MediaObjectResponseSchema

export const CreatePresignedMediaUploadSchema = z.object({
  kind: ResourceKindSchema,
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative().optional(),
  purpose: z.enum(['workflow_slot', 'task_input', 'temporary', 'public_library']).default('workflow_slot'),
  retention: MediaObjectRetentionSchema.default('project_scoped'),
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
export type MediaObjectOrigin = z.infer<typeof MediaObjectOriginSchema>
export type MediaObjectPurpose = z.infer<typeof MediaObjectPurposeSchema>
export type MediaObjectResponse = z.infer<typeof MediaObjectResponseSchema>
export type MediaObjectRetention = z.infer<typeof MediaObjectRetentionSchema>
export type MediaObjectStatus = z.infer<typeof MediaObjectStatusSchema>

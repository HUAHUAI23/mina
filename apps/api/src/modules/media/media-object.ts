import type { ResourceKind } from '@mina/contracts/modules/tasks'
import { z } from 'zod'

export const MediaObjectStatusSchema = z.enum(['uploading', 'ready', 'failed', 'deleted'])
export const MediaObjectOriginSchema = z.enum(['user_upload', 'task_output', 'external_import', 'system_generated'])
export const MediaObjectPurposeSchema = z.enum(['task_input', 'task_output', 'workflow_slot', 'temporary', 'preview'])
export const MediaObjectRetentionSchema = z.enum(['temporary', 'task_scoped', 'project_scoped', 'library'])

export const MediaObjectSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  kind: z.enum(['image', 'video', 'audio']),
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

export interface CreateMediaObjectRecordInput {
  accountId: string
  bucket: string
  byteSize: number
  checksum?: string
  durationSeconds?: number
  expiresAt?: string
  height?: number
  id: string
  kind: ResourceKind
  metadata?: Record<string, unknown>
  mimeType?: string
  origin: MediaObjectOrigin
  parentMediaObjectId?: string
  purpose: MediaObjectPurpose
  retention: MediaObjectRetention
  sourceTaskId?: string
  sourceTaskResourceId?: string
  status: MediaObjectStatus
  storageKey: string
  url: string
  width?: number
}

export type MediaObject = z.infer<typeof MediaObjectSchema>
export type MediaObjectOrigin = z.infer<typeof MediaObjectOriginSchema>
export type MediaObjectPurpose = z.infer<typeof MediaObjectPurposeSchema>
export type MediaObjectRetention = z.infer<typeof MediaObjectRetentionSchema>
export type MediaObjectStatus = z.infer<typeof MediaObjectStatusSchema>

import { z } from 'zod'

import { IsoDateTimeSchema } from '../tasks/task.schemas'

export const UserRoleSchema = z.enum(['user', 'admin'])

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).optional(),
  role: UserRoleSchema.default('user'),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.optional(),
})

export const AccountSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1),
  name: z.string().min(1),
  storageRootPrefix: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.optional(),
})

export type Account = z.infer<typeof AccountSchema>
export type User = z.infer<typeof UserSchema>
export type UserRole = z.infer<typeof UserRoleSchema>

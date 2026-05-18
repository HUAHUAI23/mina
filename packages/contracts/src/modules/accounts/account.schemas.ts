import { z } from 'zod'

import { IsoDateTimeSchema } from '../tasks/task.schemas'

export const UserRoleSchema = z.enum(['user', 'admin'])

export const UserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(3).max(64).optional(),
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

export const AuthUserSchema = UserSchema.pick({
  id: true,
  username: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
})

export const AuthSessionSchema = z.object({
  expiresAt: IsoDateTimeSchema,
  id: z.string().min(1),
  token: z.string().min(32),
  userId: z.string().min(1),
})

export const AuthResponseSchema = z.object({
  session: AuthSessionSchema,
  user: AuthUserSchema,
})

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9_.-]+$/)

const passwordSchema = z.string().min(8).max(256)

export const RegisterSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email(),
  password: passwordSchema,
  username: usernameSchema,
})

export const LoginSchema = z.object({
  identifier: z.string().trim().min(3).max(255),
  password: passwordSchema,
})

export type Account = z.infer<typeof AccountSchema>
export type AuthResponse = z.infer<typeof AuthResponseSchema>
export type AuthSession = z.infer<typeof AuthSessionSchema>
export type AuthUser = z.infer<typeof AuthUserSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type User = z.infer<typeof UserSchema>
export type UserRole = z.infer<typeof UserRoleSchema>

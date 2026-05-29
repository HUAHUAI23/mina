import { z } from 'zod'

import { SupportedLocaleSchema } from '../../schemas/api-error.schemas'
import { IsoDateTimeSchema } from '../tasks/task.schemas'

export const UserRoleSchema = z.enum(['user', 'admin'])

export const UserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(3).max(64).optional(),
  email: z.string().email(),
  displayName: z.string().min(1).optional(),
  avatarStorageKey: z.string().min(1).optional(),
  avatarMimeType: z.string().min(1).optional(),
  avatarUpdatedAt: IsoDateTimeSchema.optional(),
  preferredLocale: SupportedLocaleSchema.optional(),
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
  preferredLocale: true,
  role: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  avatarUrl: z.string().min(1).optional(),
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

export const AccountProfileSchema = AuthUserSchema

export const AccountProfileResponseSchema = z.object({
  user: AccountProfileSchema,
})

export const UpdateAccountProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
})

export const ChangePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
})

export const ChangePasswordResponseSchema = z.object({
  success: z.literal(true),
})

export const UpdateAccountPreferencesSchema = z.object({
  preferredLocale: SupportedLocaleSchema,
})

export const AccountStorageOverviewSchema = z.object({
  planName: z.string().min(1),
  quotaBytes: z.number().int().nonnegative(),
  usedBytes: z.number().int().nonnegative(),
})

export const AccountBillingStatusSchema = z.enum(['inactive', 'active', 'past_due', 'cancelled'])

export const AccountBillingOverviewSchema = z.object({
  billingStatus: AccountBillingStatusSchema,
  creditBalance: z.number(),
  currency: z.string().min(3).max(3),
  planName: z.string().min(1),
})

export const AccountAvatarUploadResponseSchema = AccountProfileResponseSchema

export type Account = z.infer<typeof AccountSchema>
export type AccountAvatarUploadResponse = z.infer<typeof AccountAvatarUploadResponseSchema>
export type AccountBillingOverview = z.infer<typeof AccountBillingOverviewSchema>
export type AccountBillingStatus = z.infer<typeof AccountBillingStatusSchema>
export type AccountProfile = z.infer<typeof AccountProfileSchema>
export type AccountProfileResponse = z.infer<typeof AccountProfileResponseSchema>
export type AccountStorageOverview = z.infer<typeof AccountStorageOverviewSchema>
export type AuthResponse = z.infer<typeof AuthResponseSchema>
export type AuthSession = z.infer<typeof AuthSessionSchema>
export type AuthUser = z.infer<typeof AuthUserSchema>
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>
export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type UpdateAccountPreferencesInput = z.infer<typeof UpdateAccountPreferencesSchema>
export type UpdateAccountProfileInput = z.infer<typeof UpdateAccountProfileSchema>
export type User = z.infer<typeof UserSchema>
export type UserRole = z.infer<typeof UserRoleSchema>

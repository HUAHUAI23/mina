import type {
  AccountBillingOverview,
  AccountProfileResponse,
  AccountStorageOverview,
  ChangePasswordInput,
  UpdateAccountPreferencesInput,
  UpdateAccountProfileInput,
  User,
} from '@mina/contracts/modules/accounts'

import { HttpError } from '../../lib/http/http-error'
import type { ObjectStorage } from '../../lib/storage/object-storage'
import type { MediaObjectService } from '../media/media-object.service'
import type { AuthActor } from './auth-context'
import type { AccountsRepository } from './accounts.repository'
import { toAuthUser } from './accounts.service'
import { hashPassword, verifyPassword } from './password'

export interface AvatarUploadInput {
  body: Uint8Array
  mimeType: string
}

export interface AccountManagementServiceConfig {
  avatarMaxBytes: number
  storageQuotaBytes: number
  storagePlanName: string
}

const DEFAULT_CONFIG: AccountManagementServiceConfig = {
  avatarMaxBytes: 2 * 1024 * 1024,
  storageQuotaBytes: 1024 * 1024 * 1024,
  storagePlanName: 'Free',
}

const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const nowIso = (): string => new Date().toISOString()
const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

export class AccountManagementService {
  constructor(
    private readonly repository: AccountsRepository,
    private readonly storage: ObjectStorage,
    private readonly mediaObjectService: MediaObjectService,
    private readonly config: AccountManagementServiceConfig = DEFAULT_CONFIG,
  ) {}

  async getProfile(actor: AuthActor): Promise<AccountProfileResponse> {
    const user = await this.requireUser(actor.userId)
    return { user: toAuthUser(user) }
  }

  async updateProfile(actor: AuthActor, input: UpdateAccountProfileInput): Promise<AccountProfileResponse> {
    const user = await this.repository.updateUserProfile({
      displayName: input.displayName.trim(),
      updatedAt: nowIso(),
      userId: actor.userId,
    })
    return { user: toAuthUser(user) }
  }

  async updateAvatar(actor: AuthActor, input: AvatarUploadInput): Promise<AccountProfileResponse> {
    if (input.body.byteLength > this.config.avatarMaxBytes) {
      throw new HttpError(413, 'ACCOUNT_AVATAR_UPLOAD_TOO_LARGE', {
        fallbackMessage: 'Avatar upload is too large.',
        messageKey: 'api_error_account_avatar_upload_too_large',
      })
    }

    const extension = AVATAR_MIME_EXTENSIONS[input.mimeType.toLowerCase()]
    if (!extension) {
      throw new HttpError(415, 'ACCOUNT_AVATAR_TYPE_UNSUPPORTED', {
        fallbackMessage: 'Avatar image type is not supported.',
        messageKey: 'api_error_account_avatar_type_unsupported',
      })
    }

    const currentUser = await this.requireUser(actor.userId)
    const avatarId = createId('avatar')
    const stored = await this.storage.putObject({
      accountId: actor.accountId,
      body: input.body,
      contentType: input.mimeType,
      objectName: `avatars/${actor.userId}/${avatarId}.${extension}`,
      scope: 'uploads',
    })
    const timestamp = nowIso()
    const user = await this.repository.updateUserAvatar({
      avatarMimeType: input.mimeType,
      avatarStorageKey: stored.key,
      avatarUpdatedAt: timestamp,
      updatedAt: timestamp,
      userId: actor.userId,
    })

    if (currentUser.avatarStorageKey && currentUser.avatarStorageKey !== stored.key) {
      await this.storage.deleteObject({
        accountId: actor.accountId,
        key: currentUser.avatarStorageKey,
      }).catch(() => undefined)
    }

    return { user: toAuthUser(user) }
  }

  async changePassword(actor: AuthActor, input: ChangePasswordInput): Promise<{ success: true }> {
    const credential = await this.repository.findPasswordCredentialByUserId(actor.userId)
    if (!credential || !(await verifyPassword(input.currentPassword, credential.passwordHash))) {
      throw new HttpError(401, 'ACCOUNT_CURRENT_PASSWORD_INVALID', {
        fallbackMessage: 'Current password is invalid.',
        messageKey: 'api_error_account_current_password_invalid',
      })
    }

    await this.repository.updatePasswordCredential(actor.userId, await hashPassword(input.newPassword), nowIso())
    return { success: true }
  }

  async updatePreferences(
    actor: AuthActor,
    input: UpdateAccountPreferencesInput,
  ): Promise<AccountProfileResponse> {
    const user = await this.repository.updateUserPreferences({
      preferredLocale: input.preferredLocale,
      updatedAt: nowIso(),
      userId: actor.userId,
    })
    return { user: toAuthUser(user) }
  }

  async getStorageOverview(actor: AuthActor): Promise<AccountStorageOverview> {
    const usage = await this.mediaObjectService.getAccountStorageUsage(actor.accountId)
    return {
      planName: this.config.storagePlanName,
      quotaBytes: this.config.storageQuotaBytes,
      usedBytes: usage.totalBytes,
    }
  }

  getBillingOverview(): AccountBillingOverview {
    return {
      billingStatus: 'inactive',
      creditBalance: 0,
      currency: 'USD',
      planName: this.config.storagePlanName,
    }
  }

  async createAvatarReadUrl(
    actor: AuthActor,
    options: { expiresInSeconds?: number; responseCacheControl?: string } = {},
  ): Promise<string> {
    const user = await this.requireUser(actor.userId)
    const avatarStorageKey = user.avatarStorageKey
    if (!avatarStorageKey) {
      throw new HttpError(404, 'ACCOUNT_AVATAR_NOT_FOUND', {
        fallbackMessage: 'Avatar not found.',
        messageKey: 'api_error_account_avatar_not_found',
      })
    }
    return this.storage.createPresignedGetUrl({
      accountId: actor.accountId,
      expiresInSeconds: options.expiresInSeconds ?? 300,
      key: avatarStorageKey,
      ...(options.responseCacheControl ? { responseCacheControl: options.responseCacheControl } : {}),
    })
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.repository.findUserById(userId)
    if (!user) {
      throw new HttpError(401, 'UNAUTHENTICATED', {
        fallbackMessage: 'Authentication is required.',
        messageKey: 'api_error_unauthenticated',
      })
    }
    return user
  }
}

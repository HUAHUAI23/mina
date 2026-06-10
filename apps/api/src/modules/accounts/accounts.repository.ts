import type { Account, AuthSession, User } from '@mina/contracts/modules/accounts'

export interface PasswordCredential {
  createdAt: string
  passwordHash: string
  passwordVersion: number
  updatedAt: string
  userId: string
}

export interface CreateUserRecordInput {
  displayName: string | undefined
  email: string
  id: string
  preferredLocale?: User['preferredLocale']
  role: User['role']
  username: string
}

export interface CreateAccountRecordInput {
  id: string
  name: string
  ownerUserId: string
  storageRootPrefix: string
}

export interface CreatePasswordCredentialInput {
  passwordHash: string
  userId: string
}

export interface RegisterUserWithAccountInput {
  account: CreateAccountRecordInput
  passwordCredential: CreatePasswordCredentialInput
  user: CreateUserRecordInput
}

export interface CreateSessionInput {
  expiresAt: string
  id: string
  token: string
  tokenHash: string
  userId: string
}

export interface StoredSession {
  expiresAt: string
  id: string
  revokedAt?: string
  tokenHash: string
  userId: string
}

export interface AccountsRepository {
  createSession(input: CreateSessionInput): Promise<AuthSession>
  findAccountByOwnerUserId(userId: string): Promise<Account | undefined>
  findPasswordCredentialByUserId(userId: string): Promise<PasswordCredential | undefined>
  findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined>
  findUserByEmail(email: string): Promise<User | undefined>
  findUserById(id: string): Promise<User | undefined>
  findUserByUsername(username: string): Promise<User | undefined>
  registerUserWithAccount(input: RegisterUserWithAccountInput): Promise<{ account: Account; user: User }>
  revokeSessionByTokenHash(tokenHash: string, revokedAtIso: string, reason: 'expired' | 'logout' | 'rotation' | 'security'): Promise<void>
  updatePasswordCredential(userId: string, passwordHash: string, updatedAtIso: string): Promise<PasswordCredential>
  updateUserAvatar(input: UpdateUserAvatarInput): Promise<User>
  updateUserPreferences(input: UpdateUserPreferencesInput): Promise<User>
  updateUserProfile(input: UpdateUserProfileInput): Promise<User>
}

export interface UpdateUserAvatarInput {
  avatarMimeType: string
  avatarStorageKey: string
  avatarUpdatedAt: string
  userId: string
  updatedAt: string
}

export interface UpdateUserPreferencesInput {
  preferredLocale: NonNullable<User['preferredLocale']>
  updatedAt: string
  userId: string
}

export interface UpdateUserProfileInput {
  displayName: string
  updatedAt: string
  userId: string
}

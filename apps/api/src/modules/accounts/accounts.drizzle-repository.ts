import type { Account, AuthSession, User } from '@mina/contracts/modules/accounts'
import { AccountSchema, UserSchema } from '@mina/contracts/modules/accounts'
import { eq, sql } from 'drizzle-orm'

import type { MinaDbClient } from '../../db/client'
import { accounts, sessions, userPasswordCredentials, users } from '../../db/schema'
import type {
  AccountsRepository,
  CreateSessionInput,
  PasswordCredential,
  RegisterUserWithAccountInput,
  StoredSession,
  UpdateUserAvatarInput,
  UpdateUserPreferencesInput,
  UpdateUserProfileInput,
} from './accounts.repository'

type AccountRow = typeof accounts.$inferSelect
type UserRow = typeof users.$inferSelect
type PasswordCredentialRow = typeof userPasswordCredentials.$inferSelect
type SessionRow = typeof sessions.$inferSelect

const toIso = (value: Date): string => value.toISOString()

const userFromRow = (row: UserRow): User =>
  UserSchema.parse({
    id: row.id,
    ...(row.username ? { username: row.username } : {}),
    email: row.email,
    ...(row.displayName ? { displayName: row.displayName } : {}),
    ...(row.avatarStorageKey ? { avatarStorageKey: row.avatarStorageKey } : {}),
    ...(row.avatarMimeType ? { avatarMimeType: row.avatarMimeType } : {}),
    ...(row.avatarUpdatedAt ? { avatarUpdatedAt: toIso(row.avatarUpdatedAt) } : {}),
    ...(row.preferredLocale ? { preferredLocale: row.preferredLocale } : {}),
    role: row.role,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    ...(row.deletedAt ? { deletedAt: toIso(row.deletedAt) } : {}),
  })

const passwordCredentialFromRow = (row: PasswordCredentialRow): PasswordCredential => ({
  createdAt: toIso(row.createdAt),
  passwordHash: row.passwordHash,
  passwordVersion: row.passwordVersion,
  updatedAt: toIso(row.updatedAt),
  userId: row.userId,
})

const accountFromRow = (row: AccountRow): Account =>
  AccountSchema.parse({
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    storageRootPrefix: row.storageRootPrefix,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    ...(row.deletedAt ? { deletedAt: toIso(row.deletedAt) } : {}),
  })

const sessionFromRow = (row: SessionRow, token: string): AuthSession => ({
  expiresAt: toIso(row.expiresAt),
  id: row.id,
  token,
  userId: row.userId,
})

const storedSessionFromRow = (row: SessionRow): StoredSession => ({
  expiresAt: toIso(row.expiresAt),
  id: row.id,
  ...(row.revokedAt ? { revokedAt: toIso(row.revokedAt) } : {}),
  tokenHash: row.tokenHash,
  userId: row.userId,
})

export class DrizzleAccountsRepository implements AccountsRepository {
  constructor(private readonly db: MinaDbClient) {}

  async createSession(input: CreateSessionInput): Promise<AuthSession> {
    const [row] = await this.db
      .insert(sessions)
      .values({
        expiresAt: new Date(input.expiresAt),
        id: input.id,
        tokenHash: input.tokenHash,
        userId: input.userId,
      })
      .returning()

    if (!row) {
      throw new Error('Session was not created.')
    }

    return sessionFromRow(row, input.token)
  }

  async registerUserWithAccount(input: RegisterUserWithAccountInput): Promise<{ account: Account; user: User }> {
    const result = await this.db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({
          displayName: input.user.displayName ?? null,
          email: input.user.email,
          id: input.user.id,
          preferredLocale: input.user.preferredLocale ?? null,
          role: input.user.role,
          username: input.user.username,
        })
        .returning()

      if (!userRow) {
        throw new Error('User was not created.')
      }

      await tx.insert(userPasswordCredentials).values({
        passwordHash: input.passwordCredential.passwordHash,
        userId: input.passwordCredential.userId,
      })

      const [accountRow] = await tx
        .insert(accounts)
        .values({
          id: input.account.id,
          name: input.account.name,
          ownerUserId: input.account.ownerUserId,
          storageRootPrefix: input.account.storageRootPrefix,
        })
        .returning()

      if (!accountRow) {
        throw new Error('Account was not created.')
      }

      return {
        account: accountFromRow(accountRow),
        user: userFromRow(userRow),
      }
    })

    return result
  }

  async findPasswordCredentialByUserId(userId: string): Promise<PasswordCredential | undefined> {
    const [row] = await this.db
      .select()
      .from(userPasswordCredentials)
      .where(eq(userPasswordCredentials.userId, userId))
      .limit(1)

    return row ? passwordCredentialFromRow(row) : undefined
  }

  async findAccountByOwnerUserId(userId: string): Promise<Account | undefined> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.ownerUserId, userId)).limit(1)
    return row ? accountFromRow(row) : undefined
  }

  async findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1)
    return row ? storedSessionFromRow(row) : undefined
  }

  async revokeSessionByTokenHash(
    tokenHash: string,
    revokedAtIso: string,
    reason: 'expired' | 'logout' | 'rotation' | 'security',
  ): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        revokedAt: new Date(revokedAtIso),
        revocationReason: reason,
        updatedAt: new Date(revokedAtIso),
      })
      .where(eq(sessions.tokenHash, tokenHash))
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1)
    return row ? userFromRow(row) : undefined
  }

  async findUserById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return row ? userFromRow(row) : undefined
  }

  async findUserByUsername(username: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.username, username)).limit(1)
    return row ? userFromRow(row) : undefined
  }

  async updatePasswordCredential(
    userId: string,
    passwordHash: string,
    updatedAtIso: string,
  ): Promise<PasswordCredential> {
    const [row] = await this.db
      .update(userPasswordCredentials)
      .set({
        passwordHash,
        passwordVersion: sql`${userPasswordCredentials.passwordVersion} + 1`,
        updatedAt: new Date(updatedAtIso),
      })
      .where(eq(userPasswordCredentials.userId, userId))
      .returning()

    if (!row) {
      throw new Error('Password credential was not updated.')
    }

    return passwordCredentialFromRow(row)
  }

  async updateUserAvatar(input: UpdateUserAvatarInput): Promise<User> {
    const [row] = await this.db
      .update(users)
      .set({
        avatarMimeType: input.avatarMimeType,
        avatarStorageKey: input.avatarStorageKey,
        avatarUpdatedAt: new Date(input.avatarUpdatedAt),
        updatedAt: new Date(input.updatedAt),
      })
      .where(eq(users.id, input.userId))
      .returning()

    if (!row) {
      throw new Error('User avatar was not updated.')
    }

    return userFromRow(row)
  }

  async updateUserPreferences(input: UpdateUserPreferencesInput): Promise<User> {
    const [row] = await this.db
      .update(users)
      .set({
        preferredLocale: input.preferredLocale,
        updatedAt: new Date(input.updatedAt),
      })
      .where(eq(users.id, input.userId))
      .returning()

    if (!row) {
      throw new Error('User preferences were not updated.')
    }

    return userFromRow(row)
  }

  async updateUserProfile(input: UpdateUserProfileInput): Promise<User> {
    const [row] = await this.db
      .update(users)
      .set({
        displayName: input.displayName,
        updatedAt: new Date(input.updatedAt),
      })
      .where(eq(users.id, input.userId))
      .returning()

    if (!row) {
      throw new Error('User profile was not updated.')
    }

    return userFromRow(row)
  }
}

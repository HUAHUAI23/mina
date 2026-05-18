import type { Account, AuthSession, User } from '@mina/contracts/modules/accounts'
import { AccountSchema, UserSchema } from '@mina/contracts/modules/accounts'
import { eq } from 'drizzle-orm'

import type { MinaDbClient } from '../../db/client'
import { accounts, sessions, userPasswordCredentials, users } from '../../db/schema'
import type {
  AccountsRepository,
  CreateSessionInput,
  PasswordCredential,
  RegisterUserWithAccountInput,
  StoredSession,
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
    role: row.role,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    ...(row.deletedAt ? { deletedAt: toIso(row.deletedAt) } : {}),
  })

const passwordCredentialFromRow = (row: PasswordCredentialRow): PasswordCredential => ({
  createdAt: toIso(row.createdAt),
  passwordHash: row.passwordHash,
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
}

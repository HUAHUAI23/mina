import type { AuthSession, User } from '@mina/contracts/modules/accounts'
import { UserSchema } from '@mina/contracts/modules/accounts'
import { eq } from 'drizzle-orm'

import type { MinaDbClient } from '../../db/client'
import { sessions, userPasswordCredentials, users } from '../../db/schema'
import type {
  AccountsRepository,
  CreatePasswordCredentialInput,
  CreateSessionInput,
  CreateUserRecordInput,
  PasswordCredential,
} from './accounts.repository'

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

const sessionFromRow = (row: SessionRow, token: string): AuthSession => ({
  expiresAt: toIso(row.expiresAt),
  id: row.id,
  token,
  userId: row.userId,
})

export class DrizzleAccountsRepository implements AccountsRepository {
  constructor(private readonly db: MinaDbClient) {}

  async createPasswordCredential(input: CreatePasswordCredentialInput): Promise<PasswordCredential> {
    const [row] = await this.db
      .insert(userPasswordCredentials)
      .values({
        passwordHash: input.passwordHash,
        userId: input.userId,
      })
      .returning()

    if (!row) {
      throw new Error('Password credential was not created.')
    }

    return passwordCredentialFromRow(row)
  }

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

  async createUser(input: CreateUserRecordInput): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        displayName: input.displayName ?? null,
        email: input.email,
        id: input.id,
        role: input.role,
        username: input.username,
      })
      .returning()

    if (!row) {
      throw new Error('User was not created.')
    }

    return userFromRow(row)
  }

  async findPasswordCredentialByUserId(userId: string): Promise<PasswordCredential | undefined> {
    const [row] = await this.db
      .select()
      .from(userPasswordCredentials)
      .where(eq(userPasswordCredentials.userId, userId))
      .limit(1)

    return row ? passwordCredentialFromRow(row) : undefined
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

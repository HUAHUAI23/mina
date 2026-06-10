
import type { Account, AuthSession, User } from '@mina/contracts/modules/accounts'

import type {
  AccountsRepository,
  CreateSessionInput,
  PasswordCredential,
  RegisterUserWithAccountInput,
  StoredSession,
  UpdateUserAvatarInput,
  UpdateUserPreferencesInput,
  UpdateUserProfileInput,
} from '../../../modules/accounts/accounts.repository'
import { clone } from '../shared/clone'

export class FakeAccountsRepository implements AccountsRepository {
  readonly #accounts = new Map<string, Account>()
  readonly #passwordCredentials = new Map<string, PasswordCredential>()
  readonly #sessions = new Map<string, AuthSession & { revokedAt?: string; revocationReason?: string; tokenHash: string }>()
  readonly #users = new Map<string, User>()

  constructor(initialUsers: User[] = []) {
    for (const user of initialUsers) {
      this.#users.set(user.id, clone(user))
    }
  }

  async addPasswordCredential(input: RegisterUserWithAccountInput['passwordCredential']): Promise<PasswordCredential> {
    const now = new Date().toISOString()
    const credential: PasswordCredential = {
      createdAt: now,
      passwordHash: input.passwordHash,
      passwordVersion: 1,
      updatedAt: now,
      userId: input.userId,
    }
    this.#passwordCredentials.set(input.userId, credential)
    return clone(credential)
  }

  async addAccount(input: RegisterUserWithAccountInput['account']): Promise<Account> {
    const now = new Date().toISOString()
    const account: Account = {
      createdAt: now,
      id: input.id,
      name: input.name,
      ownerUserId: input.ownerUserId,
      storageRootPrefix: input.storageRootPrefix,
      updatedAt: now,
    }
    this.#accounts.set(account.id, account)
    return clone(account)
  }

  async createSession(input: CreateSessionInput): Promise<AuthSession> {
    const session = {
      expiresAt: input.expiresAt,
      id: input.id,
      token: input.token,
      tokenHash: input.tokenHash,
      userId: input.userId,
    }
    this.#sessions.set(input.id, session)
    return clone(session)
  }

  async addUser(input: RegisterUserWithAccountInput['user']): Promise<User> {
    const now = new Date().toISOString()
    const user: User = {
      createdAt: now,
      displayName: input.displayName,
      email: input.email,
      id: input.id,
      ...(input.preferredLocale ? { preferredLocale: input.preferredLocale } : {}),
      role: input.role,
      updatedAt: now,
      username: input.username,
    }
    this.#users.set(user.id, user)
    return clone(user)
  }

  async registerUserWithAccount(input: RegisterUserWithAccountInput): Promise<{ account: Account; user: User }> {
    const user = await this.addUser(input.user)
    await this.addPasswordCredential(input.passwordCredential)
    const account = await this.addAccount(input.account)
    return { account, user }
  }

  async findPasswordCredentialByUserId(userId: string): Promise<PasswordCredential | undefined> {
    const credential = this.#passwordCredentials.get(userId)
    return credential ? clone(credential) : undefined
  }

  async findAccountByOwnerUserId(userId: string): Promise<Account | undefined> {
    const account = [...this.#accounts.values()].find((item) => item.ownerUserId === userId)
    return account ? clone(account) : undefined
  }

  async findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined> {
    const session = [...this.#sessions.values()].find((item) => item.tokenHash === tokenHash)
    return session ? clone(session) : undefined
  }

  async revokeSessionByTokenHash(
    tokenHash: string,
    revokedAtIso: string,
    reason: 'expired' | 'logout' | 'rotation' | 'security',
  ): Promise<void> {
    const session = [...this.#sessions.values()].find((item) => item.tokenHash === tokenHash)
    if (!session) {
      return
    }
    this.#sessions.set(session.id, {
      ...session,
      revokedAt: revokedAtIso,
      revocationReason: reason,
    })
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.toLowerCase()
    const user = [...this.#users.values()].find((item) => item.email.toLowerCase() === normalizedEmail)
    return user ? clone(user) : undefined
  }

  async findUserById(id: string): Promise<User | undefined> {
    const user = this.#users.get(id)
    return user ? clone(user) : undefined
  }

  async findUserByUsername(username: string): Promise<User | undefined> {
    const normalizedUsername = username.toLowerCase()
    const user = [...this.#users.values()].find((item) => item.username?.toLowerCase() === normalizedUsername)
    return user ? clone(user) : undefined
  }

  async updatePasswordCredential(
    userId: string,
    passwordHash: string,
    updatedAtIso: string,
  ): Promise<PasswordCredential> {
    const credential = this.#passwordCredentials.get(userId)
    if (!credential) {
      throw new Error('Password credential was not updated.')
    }
    const updated: PasswordCredential = {
      ...credential,
      passwordHash,
      passwordVersion: credential.passwordVersion + 1,
      updatedAt: updatedAtIso,
    }
    this.#passwordCredentials.set(userId, updated)
    return clone(updated)
  }

  async updateUserAvatar(input: UpdateUserAvatarInput): Promise<User> {
    const user = this.#users.get(input.userId)
    if (!user) {
      throw new Error('User avatar was not updated.')
    }
    const updated: User = {
      ...user,
      avatarMimeType: input.avatarMimeType,
      avatarStorageKey: input.avatarStorageKey,
      avatarUpdatedAt: input.avatarUpdatedAt,
      updatedAt: input.updatedAt,
    }
    this.#users.set(input.userId, updated)
    return clone(updated)
  }

  async updateUserPreferences(input: UpdateUserPreferencesInput): Promise<User> {
    const user = this.#users.get(input.userId)
    if (!user) {
      throw new Error('User preferences were not updated.')
    }
    const updated: User = {
      ...user,
      preferredLocale: input.preferredLocale,
      updatedAt: input.updatedAt,
    }
    this.#users.set(input.userId, updated)
    return clone(updated)
  }

  async updateUserProfile(input: UpdateUserProfileInput): Promise<User> {
    const user = this.#users.get(input.userId)
    if (!user) {
      throw new Error('User profile was not updated.')
    }
    const updated: User = {
      ...user,
      displayName: input.displayName,
      updatedAt: input.updatedAt,
    }
    this.#users.set(input.userId, updated)
    return clone(updated)
  }
}

import type {
  AuthResponse,
  AuthSession,
  AuthUser,
  LoginInput,
  RegisterInput,
  User,
} from '@mina/contracts/modules/accounts'

import { HttpError } from '../../lib/http/http-error'
import type { AuthActor } from './auth-context'
import type { AccountsRepository } from './accounts.repository'
import { hashPassword, verifyPassword } from './password'
import { createSessionToken, hashSessionToken } from './session-token'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const normalizeUsername = (username: string): string => username.trim().toLowerCase()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const toAuthUser = (user: User): AuthUser => ({
  createdAt: user.createdAt,
  displayName: user.displayName,
  email: user.email,
  id: user.id,
  role: user.role,
  updatedAt: user.updatedAt,
  username: user.username,
})

export class AccountsService {
  constructor(private readonly accountsRepository: AccountsRepository) {}

  async login(input: LoginInput): Promise<AuthResponse> {
    const identifier = input.identifier.trim()
    const user = identifier.includes('@')
      ? await this.accountsRepository.findUserByEmail(normalizeEmail(identifier))
      : await this.accountsRepository.findUserByUsername(normalizeUsername(identifier))

    if (!user) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.')
    }

    const credential = await this.accountsRepository.findPasswordCredentialByUserId(user.id)
    if (!credential || !(await verifyPassword(input.password, credential.passwordHash))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.')
    }

    await this.requireAccount(user.id)

    return {
      session: await this.createSession(user.id),
      user: toAuthUser(user),
    }
  }

  async getActorForSessionToken(token: string): Promise<AuthActor> {
    const session = await this.accountsRepository.findSessionByTokenHash(hashSessionToken(token))
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.')
    }

    const user = await this.accountsRepository.findUserById(session.userId)
    if (!user) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.')
    }

    const account = await this.requireAccount(user.id)

    return {
      accountId: account.id,
      role: user.role,
      userId: user.id,
    }
  }

  async register(input: RegisterInput): Promise<AuthResponse> {
    const email = normalizeEmail(input.email)
    const username = normalizeUsername(input.username)

    if (await this.accountsRepository.findUserByEmail(email)) {
      throw new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'Email is already registered.')
    }

    if (await this.accountsRepository.findUserByUsername(username)) {
      throw new HttpError(409, 'USERNAME_ALREADY_REGISTERED', 'Username is already registered.')
    }

    const userId = createId('user')
    const { user } = await this.accountsRepository.registerUserWithAccount({
      account: {
        id: createId('account'),
        name: input.displayName?.trim() || username,
        ownerUserId: userId,
        storageRootPrefix: `users/${userId}`,
      },
      passwordCredential: {
        passwordHash: await hashPassword(input.password),
        userId,
      },
      user: {
        displayName: input.displayName?.trim() || undefined,
        email,
        id: userId,
        role: 'user',
        username,
      },
    })

    return {
      session: await this.createSession(user.id),
      user: toAuthUser(user),
    }
  }

  private async requireAccount(userId: string) {
    const account = await this.accountsRepository.findAccountByOwnerUserId(userId)
    if (!account) {
      throw new HttpError(409, 'ACCOUNT_NOT_INITIALIZED', 'User account is not initialized.')
    }
    return account
  }

  private async createSession(userId: string): Promise<AuthSession> {
    const token = createSessionToken()
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

    return this.accountsRepository.createSession({
      expiresAt,
      id: createId('session'),
      token,
      tokenHash: hashSessionToken(token),
      userId,
    })
  }

}

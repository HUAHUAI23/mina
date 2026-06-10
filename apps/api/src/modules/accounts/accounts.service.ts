import type {
  AuthResponse,
  AuthSession,
  AuthUser,
  LoginInput,
  RegisterInput,
  User,
} from '@mina/contracts/modules/accounts'

import { HttpError } from '../../lib/http/http-error'
import { appLogger } from '../../lib/logger/logger'
import type { AuthActor } from './auth-context'
import type { AccountsRepository } from './accounts.repository'
import { hashPassword, verifyPassword } from './password'
import { createSessionToken, hashSessionToken } from './session-token'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7
type AccountHookLogger = Pick<typeof appLogger, 'error'>

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const normalizeUsername = (username: string): string => username.trim().toLowerCase()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

export const toAuthUser = (user: User): AuthUser => ({
  ...(user.avatarUpdatedAt ? { avatarUpdatedAt: user.avatarUpdatedAt } : {}),
  createdAt: user.createdAt,
  displayName: user.displayName,
  email: user.email,
  id: user.id,
  preferredLocale: user.preferredLocale,
  role: user.role,
  updatedAt: user.updatedAt,
  username: user.username,
})

export interface AccountsServiceHooks {
  onAccountCreated?(accountId: string): Promise<void>
}

export class AccountsService {
  constructor(
    private readonly accountsRepository: AccountsRepository,
    private readonly hooks: AccountsServiceHooks = {},
    private readonly logger: AccountHookLogger = appLogger,
  ) {}

  async login(input: LoginInput): Promise<AuthResponse> {
    const identifier = input.identifier.trim()
    const user = identifier.includes('@')
      ? await this.accountsRepository.findUserByEmail(normalizeEmail(identifier))
      : await this.accountsRepository.findUserByUsername(normalizeUsername(identifier))

    if (!user) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', {
        fallbackMessage: 'Invalid username or password.',
        messageKey: 'api_error_auth_invalid_credentials',
      })
    }

    const credential = await this.accountsRepository.findPasswordCredentialByUserId(user.id)
    if (!credential || !(await verifyPassword(input.password, credential.passwordHash))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', {
        fallbackMessage: 'Invalid username or password.',
        messageKey: 'api_error_auth_invalid_credentials',
      })
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
      throw new HttpError(401, 'UNAUTHENTICATED', {
        fallbackMessage: 'Authentication is required.',
        messageKey: 'api_error_unauthenticated',
      })
    }

    const user = await this.accountsRepository.findUserById(session.userId)
    if (!user) {
      throw new HttpError(401, 'UNAUTHENTICATED', {
        fallbackMessage: 'Authentication is required.',
        messageKey: 'api_error_unauthenticated',
      })
    }

    const account = await this.requireAccount(user.id)

    return {
      accountId: account.id,
      role: user.role,
      userId: user.id,
    }
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return
    }
    await this.accountsRepository.revokeSessionByTokenHash(hashSessionToken(token), new Date().toISOString(), 'logout')
  }

  async register(input: RegisterInput): Promise<AuthResponse> {
    const email = normalizeEmail(input.email)
    const username = normalizeUsername(input.username)

    if (await this.accountsRepository.findUserByEmail(email)) {
      throw new HttpError(409, 'EMAIL_ALREADY_REGISTERED', {
        fallbackMessage: 'Email is already registered.',
        messageKey: 'api_error_email_already_registered',
      })
    }

    if (await this.accountsRepository.findUserByUsername(username)) {
      throw new HttpError(409, 'USERNAME_ALREADY_REGISTERED', {
        fallbackMessage: 'Username is already registered.',
        messageKey: 'api_error_username_already_registered',
      })
    }

    const userId = createId('user')
    const { account, user } = await this.accountsRepository.registerUserWithAccount({
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
    try {
      await this.hooks.onAccountCreated?.(account.id)
    } catch (error) {
      this.logger.error({ accountId: account.id, error }, 'Account creation hook failed.')
    }

    return {
      session: await this.createSession(user.id),
      user: toAuthUser(user),
    }
  }

  private async requireAccount(userId: string) {
    const account = await this.accountsRepository.findAccountByOwnerUserId(userId)
    if (!account) {
      throw new HttpError(409, 'ACCOUNT_NOT_INITIALIZED', {
        fallbackMessage: 'User account is not initialized.',
        messageKey: 'api_error_account_not_initialized',
      })
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

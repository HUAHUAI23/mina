import type {
  AuthResponse,
  AuthSession,
  AuthUser,
  LoginInput,
  RegisterInput,
  User,
} from '@mina/contracts/modules/accounts'

import { HttpError } from '../../lib/http/http-error'
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

    return {
      session: await this.createSession(user.id),
      user: toAuthUser(user),
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

    const user = await this.accountsRepository.createUser({
      displayName: input.displayName?.trim() || undefined,
      email,
      id: createId('user'),
      role: 'user',
      username,
    })

    await this.accountsRepository.createPasswordCredential({
      passwordHash: await hashPassword(input.password),
      userId: user.id,
    })

    return {
      session: await this.createSession(user.id),
      user: toAuthUser(user),
    }
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

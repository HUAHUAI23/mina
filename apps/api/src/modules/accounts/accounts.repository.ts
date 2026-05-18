import type { Account, AuthSession, User } from '@mina/contracts/modules/accounts'

export interface PasswordCredential {
  createdAt: string
  passwordHash: string
  updatedAt: string
  userId: string
}

export interface CreateUserRecordInput {
  displayName: string | undefined
  email: string
  id: string
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
}

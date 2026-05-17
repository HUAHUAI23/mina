import type { AuthSession, User } from '@mina/contracts/modules/accounts'

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

export interface CreatePasswordCredentialInput {
  passwordHash: string
  userId: string
}

export interface CreateSessionInput {
  expiresAt: string
  id: string
  token: string
  tokenHash: string
  userId: string
}

export interface AccountsRepository {
  createPasswordCredential(input: CreatePasswordCredentialInput): Promise<PasswordCredential>
  createSession(input: CreateSessionInput): Promise<AuthSession>
  createUser(input: CreateUserRecordInput): Promise<User>
  findPasswordCredentialByUserId(userId: string): Promise<PasswordCredential | undefined>
  findUserByEmail(email: string): Promise<User | undefined>
  findUserById(id: string): Promise<User | undefined>
  findUserByUsername(username: string): Promise<User | undefined>
}

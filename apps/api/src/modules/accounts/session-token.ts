import { createHash, randomBytes } from 'node:crypto'

export const createSessionToken = (): string => randomBytes(32).toString('base64url')

export const hashSessionToken = (token: string): string => createHash('sha256').update(token).digest('hex')

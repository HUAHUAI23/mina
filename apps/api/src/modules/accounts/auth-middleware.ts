import type { Context } from 'hono'

import { HttpError } from '../../lib/http/http-error'
import type { AccountsService } from './accounts.service'
import type { AuthActor } from './auth-context'

const AUTH_ACTOR_KEY = 'mina.auth.actor'

const bearerTokenFromHeader = (value: string | undefined): string | undefined => {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim()
}

export const requireAuthActor = async (c: Context, accountsService: AccountsService): Promise<AuthActor> => {
  const existing = c.get(AUTH_ACTOR_KEY) as AuthActor | undefined
  if (existing) {
    return existing
  }

  const token = bearerTokenFromHeader(c.req.header('Authorization'))
  if (!token) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.')
  }

  const actor = await accountsService.getActorForSessionToken(token)
  c.set(AUTH_ACTOR_KEY, actor)
  return actor
}

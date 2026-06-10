import type { Context } from 'hono'

import { HttpError } from '../../lib/http/http-error'
import type { AccountsService } from './accounts.service'
import type { AuthActor } from './auth-context'

const AUTH_ACTOR_KEY = 'mina.auth.actor'

const bearerTokenFromHeader = (value: string | undefined): string | undefined => {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim()
}

const tokenFromWebSocketProtocol = (value: string | undefined): string | undefined =>
  value
    ?.split(',')
    .map((protocol) => protocol.trim())
    .find((protocol) => protocol.startsWith('mina-token.'))
    ?.slice('mina-token.'.length)
    .trim()

const tokenFromRequest = (c: Context): string | undefined =>
  bearerTokenFromHeader(c.req.header('Authorization')) ??
  tokenFromWebSocketProtocol(c.req.header('Sec-WebSocket-Protocol')) ??
  c.req.query('token')?.trim()

export const requireAuthActor = async (c: Context, accountsService: AccountsService): Promise<AuthActor> => {
  const existing = c.get(AUTH_ACTOR_KEY) as AuthActor | undefined
  if (existing) {
    return existing
  }

  const token = tokenFromRequest(c)
  if (!token) {
    throw new HttpError(401, 'UNAUTHENTICATED', {
      fallbackMessage: 'Authentication is required.',
      messageKey: 'api_error_unauthenticated',
    })
  }

  const actor = await accountsService.getActorForSessionToken(token)
  c.set(AUTH_ACTOR_KEY, actor)
  return actor
}

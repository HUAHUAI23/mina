import type { Context } from 'hono'

import { HttpError } from '../../lib/http/http-error'
import type { AccountsService } from './accounts.service'
import type { AuthActor } from './auth-context'
import { readSessionTokenCookie } from './auth-cookie'

const AUTH_ACTOR_KEY = 'mina.auth.actor'

type AuthTokenSource = 'authorization' | 'cookie' | 'websocket-protocol'

interface AuthTokenOptions {
  sources?: readonly AuthTokenSource[]
}

const DEFAULT_AUTH_TOKEN_SOURCES = ['authorization', 'websocket-protocol'] as const

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

const tokenReaders = {
  authorization: (c: Context) => bearerTokenFromHeader(c.req.header('Authorization')),
  cookie: readSessionTokenCookie,
  'websocket-protocol': (c: Context) => tokenFromWebSocketProtocol(c.req.header('Sec-WebSocket-Protocol')),
} satisfies Record<AuthTokenSource, (c: Context) => string | undefined>

const tokenFromRequest = (c: Context, options: AuthTokenOptions = {}): string | undefined => {
  for (const source of options.sources ?? DEFAULT_AUTH_TOKEN_SOURCES) {
    const token = tokenReaders[source](c)
    if (token) {
      return token
    }
  }
  return undefined
}

export const readAuthTokenFromRequest = tokenFromRequest

export const requireAuthActor = async (
  c: Context,
  accountsService: AccountsService,
  options: AuthTokenOptions = {},
): Promise<AuthActor> => {
  const existing = c.get(AUTH_ACTOR_KEY) as AuthActor | undefined
  if (existing) {
    return existing
  }

  const token = tokenFromRequest(c, options)
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

export const requireBrowserContentAuthActor = (c: Context, accountsService: AccountsService): Promise<AuthActor> =>
  requireAuthActor(c, accountsService, { sources: ['authorization', 'cookie'] })

export const requireBrowserWebSocketAuthActor = (c: Context, accountsService: AccountsService): Promise<AuthActor> =>
  requireAuthActor(c, accountsService, { sources: ['authorization', 'websocket-protocol', 'cookie'] })

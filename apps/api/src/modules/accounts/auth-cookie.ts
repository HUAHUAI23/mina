import type { AuthSession } from '@mina/contracts/modules/accounts'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import { apiEnv } from '../../config/env'

export const AUTH_SESSION_COOKIE = 'mina_session'

const cookieOptions = (session: AuthSession) => ({
  httpOnly: true,
  path: '/',
  sameSite: 'Lax' as const,
  secure: apiEnv.nodeEnv === 'production',
  maxAge: Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)),
})

export const readSessionTokenCookie = (c: Context): string | undefined =>
  getCookie(c, AUTH_SESSION_COOKIE)?.trim() || undefined

export const setSessionTokenCookie = (c: Context, session: AuthSession): void => {
  setCookie(c, AUTH_SESSION_COOKIE, session.token, cookieOptions(session))
}

export const clearSessionTokenCookie = (c: Context): void => {
  deleteCookie(c, AUTH_SESSION_COOKIE, {
    path: '/',
    secure: apiEnv.nodeEnv === 'production',
  })
}

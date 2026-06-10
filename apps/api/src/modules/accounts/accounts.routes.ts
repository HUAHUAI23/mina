import { AuthResponseSchema, LoginSchema, LogoutResponseSchema, RegisterSchema } from '@mina/contracts/modules/accounts'
import { Hono } from 'hono'

import { apiValidator } from '../../lib/http/validation'
import { clearSessionTokenCookie, setSessionTokenCookie } from './auth-cookie'
import { readAuthTokenFromRequest } from './auth-middleware'
import type { AccountsService } from './accounts.service'

export const createAccountsRoutes = (accountsService: AccountsService): Hono =>
  new Hono()
    .post('/register', apiValidator('json', RegisterSchema), async (c) => {
      const payload = c.req.valid('json')
      const auth = AuthResponseSchema.parse(await accountsService.register(payload))
      setSessionTokenCookie(c, auth.session)
      return c.json(auth, 201)
    })
    .post('/login', apiValidator('json', LoginSchema), async (c) => {
      const payload = c.req.valid('json')
      const auth = AuthResponseSchema.parse(await accountsService.login(payload))
      setSessionTokenCookie(c, auth.session)
      return c.json(auth)
    })
    .post('/logout', async (c) => {
      await accountsService.logout(readAuthTokenFromRequest(c, { sources: ['authorization', 'cookie'] }))
      clearSessionTokenCookie(c)
      return c.json(LogoutResponseSchema.parse({ success: true }))
    })

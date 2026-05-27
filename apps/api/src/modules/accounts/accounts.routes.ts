import { AuthResponseSchema, LoginSchema, RegisterSchema } from '@mina/contracts/modules/accounts'
import { Hono } from 'hono'

import { apiValidator } from '../../lib/http/validation'
import type { AccountsService } from './accounts.service'

export const createAccountsRoutes = (accountsService: AccountsService): Hono =>
  new Hono()
    .post('/register', apiValidator('json', RegisterSchema), async (c) => {
      const payload = c.req.valid('json')
      return c.json(AuthResponseSchema.parse(await accountsService.register(payload)), 201)
    })
    .post('/login', apiValidator('json', LoginSchema), async (c) => {
      const payload = c.req.valid('json')
      return c.json(AuthResponseSchema.parse(await accountsService.login(payload)))
    })

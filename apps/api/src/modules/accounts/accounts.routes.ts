import { sValidator } from '@hono/standard-validator'
import { AuthResponseSchema, LoginSchema, RegisterSchema } from '@mina/contracts/modules/accounts'
import { Hono } from 'hono'

import type { AccountsService } from './accounts.service'

export const createAccountsRoutes = (accountsService: AccountsService): Hono =>
  new Hono()
    .post('/register', sValidator('json', RegisterSchema), async (c) => {
      const payload = c.req.valid('json')
      return c.json(AuthResponseSchema.parse(await accountsService.register(payload)), 201)
    })
    .post('/login', sValidator('json', LoginSchema), async (c) => {
      const payload = c.req.valid('json')
      return c.json(AuthResponseSchema.parse(await accountsService.login(payload)))
    })

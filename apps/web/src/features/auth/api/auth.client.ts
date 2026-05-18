import type { AppType } from '@mina/api/client'
import { AuthResponseSchema } from '@mina/contracts/modules/accounts'
import type { LoginInput, RegisterInput } from '@mina/contracts/modules/accounts'
import { hc } from 'hono/client'

import { webEnv } from '../../../config/env'
import { readJson } from '../../../lib/http'

const client = hc<AppType>(webEnv.apiBaseUrl)

export const loginWithPassword = async (input: LoginInput) => {
  const response = await client.api.auth.login.$post({ json: input })

  return readJson(response, AuthResponseSchema)
}

export const registerWithPassword = async (input: RegisterInput) => {
  const response = await client.api.auth.register.$post({ json: input })

  return readJson(response, AuthResponseSchema)
}

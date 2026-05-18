import { AuthResponseSchema } from '@mina/contracts/modules/accounts'
import type { LoginInput, RegisterInput } from '@mina/contracts/modules/accounts'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export const loginWithPassword = async (input: LoginInput) => {
  const response = await apiClient.api.auth.login.$post({ json: input })

  return readJson(response, AuthResponseSchema)
}

export const registerWithPassword = async (input: RegisterInput) => {
  const response = await apiClient.api.auth.register.$post({ json: input })

  return readJson(response, AuthResponseSchema)
}

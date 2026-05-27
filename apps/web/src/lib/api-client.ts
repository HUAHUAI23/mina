import type { AppType } from '@mina/api/client'
import { hc } from 'hono/client'

import { webEnv } from '../config/env'
import { getCurrentLocaleForRequest } from '../app/locale-storage'
import { readStoredAuthToken } from '../features/auth/auth-session'

export const apiClient = hc<AppType>(webEnv.apiBaseUrl, {
  headers: () => {
    const token = readStoredAuthToken()
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Mina-Locale': getCurrentLocaleForRequest(),
    }
  },
})

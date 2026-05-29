import { AuthResponseSchema } from '@mina/contracts/modules/accounts'
import type { AuthResponse } from '@mina/contracts/modules/accounts'

const AUTH_SESSION_STORAGE_KEY = 'mina.auth.session'

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const toStoredAuthSession = (authSession: AuthResponse): AuthResponse => {
  const { avatarUrl, ...user } = authSession.user
  return {
    ...authSession,
    user,
  }
}

export const readStoredAuthSession = (): AuthResponse | null => {
  if (!canUseStorage()) {
    return null
  }

  const rawSession = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)

  if (!rawSession) {
    return null
  }

  try {
    const parsedSession = AuthResponseSchema.safeParse(JSON.parse(rawSession))

    if (!parsedSession.success) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
      return null
    }

    if (Date.parse(parsedSession.data.session.expiresAt) <= Date.now()) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
      return null
    }

    return toStoredAuthSession(parsedSession.data)
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
    return null
  }
}

export const readStoredAuthToken = (): string | undefined => readStoredAuthSession()?.session.token

export const storeAuthSession = (authSession: AuthResponse): void => {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(toStoredAuthSession(authSession)))
}

export const clearStoredAuthSession = (): void => {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
}

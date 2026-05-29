import type { PropsWithChildren } from 'react'
import { createContext, useContext, useMemo, useState } from 'react'
import type { AuthResponse, AuthSession, AuthUser } from '@mina/contracts/modules/accounts'

import { clearStoredAuthSession, readStoredAuthSession, storeAuthSession } from '../auth-session'

interface AuthContextValue {
  auth: AuthResponse | null
  isAuthenticated: boolean
  logout: () => void
  session: AuthSession | null
  setAuthenticatedSession: (authSession: AuthResponse) => void
  updateAuthenticatedUser: (user: AuthUser) => void
  user: AuthUser | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [auth, setAuth] = useState<AuthResponse | null>(() => readStoredAuthSession())

  const value = useMemo<AuthContextValue>(() => {
    const setAuthenticatedSession = (authSession: AuthResponse) => {
      storeAuthSession(authSession)
      setAuth(authSession)
    }

    const logout = () => {
      clearStoredAuthSession()
      setAuth(null)
    }

    const updateAuthenticatedUser = (user: AuthUser) => {
      setAuth((current) => {
        if (!current) {
          return current
        }
        const next = {
          ...current,
          user,
        }
        storeAuthSession(next)
        return next
      })
    }

    return {
      auth,
      isAuthenticated: Boolean(auth),
      logout,
      session: auth?.session ?? null,
      setAuthenticatedSession,
      updateAuthenticatedUser,
      user: auth?.user ?? null,
    }
  }, [auth])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const auth = useContext(AuthContext)

  if (!auth) {
    throw new Error('useAuth must be used within AuthProvider.')
  }

  return auth
}

import { createRootRoute, Outlet, redirect, useLocation } from '@tanstack/react-router'

import { AppShell } from '../app/app-shell'
import { readStoredAuthSession } from '../features/auth/auth-session'
import { defaultAuthenticatedPath, loginPath, sanitizeAuthRedirectPath } from '../features/auth/redirect'

const isLoginPath = (pathname: string): boolean => pathname === loginPath

const redirectPathFromLocation = (location: { href: string; pathname: string }): string => {
  if (location.pathname === '/') {
    return defaultAuthenticatedPath
  }

  return location.href
}

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const authenticated = Boolean(readStoredAuthSession())

    if (!authenticated && !isLoginPath(location.pathname)) {
      throw redirect({
        search: { redirect: redirectPathFromLocation(location) },
        to: loginPath,
      })
    }

    if (authenticated && isLoginPath(location.pathname)) {
      const search = location.search as { redirect?: unknown }
      throw redirect({
        href: sanitizeAuthRedirectPath(typeof search.redirect === 'string' ? search.redirect : undefined),
      })
    }
  },
  component: RootLayout,
})

function RootLayout() {
  const { pathname } = useLocation()
  if (isLoginPath(pathname)) {
    return <Outlet />
  }

  const canvasRoute = pathname.startsWith('/canvas/') && pathname.length > '/canvas/'.length
  const route = <Outlet />

  return canvasRoute ? route : <AppShell>{route}</AppShell>
}

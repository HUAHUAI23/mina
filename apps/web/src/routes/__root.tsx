import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router'

import { AppShell } from '../app/app-shell'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const { pathname } = useLocation()
  const canvasRoute = pathname.startsWith('/canvas/') && pathname.length > '/canvas/'.length
  const route = <Outlet />

  return canvasRoute ? route : <AppShell>{route}</AppShell>
}

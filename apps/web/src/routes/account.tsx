import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/account')({
  component: AccountLayout,
})

function AccountLayout() {
  return <Outlet />
}

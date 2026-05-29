import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AuthPage } from '../features/auth/components/auth-page'

const LoginSearchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  component: LoginRoute,
  validateSearch: (search) => LoginSearchSchema.parse(search),
})

function LoginRoute() {
  const search = Route.useSearch()
  return <AuthPage redirectPath={search.redirect} />
}

import { createFileRoute } from '@tanstack/react-router'

import { PasswordPanel } from '../features/account/components/password-panel'

export const Route = createFileRoute('/account/password')({
  component: PasswordPanel,
})

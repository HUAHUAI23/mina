import { createFileRoute } from '@tanstack/react-router'

import { ProfilePanel } from '../features/account/components/profile-panel'

export const Route = createFileRoute('/account/profile')({
  component: ProfilePanel,
})

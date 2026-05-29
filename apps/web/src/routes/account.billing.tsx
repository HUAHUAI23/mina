import { createFileRoute } from '@tanstack/react-router'

import { BillingPanel } from '../features/account/components/billing-panel'

export const Route = createFileRoute('/account/billing')({
  component: BillingPanel,
})

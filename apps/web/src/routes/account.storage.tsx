import { createFileRoute } from '@tanstack/react-router'

import { StoragePanel } from '../features/account/components/storage-panel'

export const Route = createFileRoute('/account/storage')({
  component: StoragePanel,
})

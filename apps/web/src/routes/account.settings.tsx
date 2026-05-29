import { createFileRoute } from '@tanstack/react-router'

import { SettingsPanel } from '../features/account/components/settings-panel'

export const Route = createFileRoute('/account/settings')({
  component: SettingsPanel,
})

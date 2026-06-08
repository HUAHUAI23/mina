import { createFileRoute } from '@tanstack/react-router'

import { AssetLibraryPage } from '../features/assets/components/asset-library-page'

export const Route = createFileRoute('/assets')({
  component: AssetLibraryPage,
})

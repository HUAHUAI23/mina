import { createFileRoute } from '@tanstack/react-router'

import { PlazaPage } from '../features/plaza/components/plaza-page'

export const Route = createFileRoute('/')({
  component: PlazaPage,
})

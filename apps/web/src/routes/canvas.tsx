import { createFileRoute } from '@tanstack/react-router'

import { CanvasPage } from '../features/canvas/components/canvas-page'

export const Route = createFileRoute('/canvas')({
  component: CanvasPage,
})

import { createFileRoute } from '@tanstack/react-router'
import { Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/canvas')({
  component: CanvasLayout,
})

function CanvasLayout() {
  return <Outlet />
}

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/canvas/')({
  beforeLoad: () => {
    throw redirect({ to: '/projects' })
  },
})

import { Hono } from 'hono'

export const createHealthRoutes = () =>
  new Hono().get('/', (c) =>
    c.json({
      service: '@mina/api',
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    }),
  )

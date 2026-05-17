import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'

import { apiEnv } from '../config/env'
import { HttpError, createErrorPayload } from '../lib/http/http-error'
import { appLogger } from '../lib/logger/logger'
import { createApiRouter } from './api-router'
import { createAppDependencies, type AppDependencies } from './dependencies'
import { createOpenApiRouter } from './openapi'

export const createApp = (dependencies: AppDependencies = createAppDependencies()) => {
  const app = new Hono()
  const apiRouter = createApiRouter(dependencies)

  app.use('*', requestId())
  app.use('*', prettyJSON())
  app.use('*', secureHeaders())
  app.use('/api/*', cors({ origin: apiEnv.allowedOrigin }))

  if (apiEnv.nodeEnv !== 'test') {
    app.use('*', logger())
  }

  app.get('/', (c) =>
    c.json({
      name: 'mina-api',
      status: 'ok' as const,
    }),
  )

  app.route('/', apiRouter)
  app.route('/', createOpenApiRouter())

  app.notFound((c) => c.json(createErrorPayload('NOT_FOUND', 'Route not found.'), 404))

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(createErrorPayload(error.code, error.message), error.status)
    }

    appLogger.error({ error }, 'Unhandled API error.')
    return c.json(createErrorPayload('INTERNAL_SERVER_ERROR', 'Unexpected server error.'), 500)
  })

  return app
}

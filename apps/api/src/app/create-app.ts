import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { getRequestLocale, resolveHonoRequestLocale } from '@mina/i18n/server'

import { apiEnv } from '../config/env'
import { HttpError, createErrorPayload } from '../lib/http/http-error'
import { appLogger } from '../lib/logger/logger'
import { createApiRouter } from './api-router'
import { createAppDependencies, type AppDependencies } from './dependencies'
import './hono-context'
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

  app.use('/api/*', async (c, next) => {
    c.set('locale', resolveHonoRequestLocale(c))
    await next()
  })

  app.get('/', (c) =>
    c.json({
      name: 'mina-api',
      status: 'ok' as const,
    }),
  )

  app.route('/', apiRouter)
  app.route('/', createOpenApiRouter())

  app.notFound((c) =>
    c.json(
      createErrorPayload({
        code: 'NOT_FOUND',
        fallbackMessage: 'Route not found.',
        locale: getRequestLocale(c),
        messageKey: 'api_error_not_found',
      }),
      404,
    ),
  )

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      const input = {
        code: error.code,
        fallbackMessage: error.fallbackMessage,
        locale: getRequestLocale(c),
        ...(error.issues ? { issues: error.issues } : {}),
        ...(error.messageKey ? { messageKey: error.messageKey } : {}),
        ...(error.params ? { params: error.params } : {}),
      }

      return c.json(
        createErrorPayload(input),
        error.status,
      )
    }

    appLogger.error({ error }, 'Unhandled API error.')
    return c.json(
      createErrorPayload({
        code: 'INTERNAL_SERVER_ERROR',
        fallbackMessage: 'Unexpected server error.',
        locale: getRequestLocale(c),
        messageKey: 'api_error_internal_server_error',
      }),
      500,
    )
  })

  return app
}

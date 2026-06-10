import type { Context } from 'hono'

import { apiEnv } from '../../config/env'
import { HttpError } from './http-error'

const originOf = (value: string): string | undefined => {
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

export const isAllowedWebSocketOrigin = (
  origin: string | undefined,
  allowedOrigin = apiEnv.allowedOrigin,
): boolean => {
  if (!origin) {
    return true
  }

  const requestOrigin = originOf(origin)
  const configuredOrigin = originOf(allowedOrigin)
  return Boolean(requestOrigin && configuredOrigin && requestOrigin === configuredOrigin)
}

export const requireAllowedWebSocketOrigin = (c: Context): void => {
  if (isAllowedWebSocketOrigin(c.req.header('Origin'))) {
    return
  }

  throw new HttpError(403, 'WEBSOCKET_ORIGIN_FORBIDDEN', {
    fallbackMessage: 'WebSocket origin is not allowed.',
  })
}

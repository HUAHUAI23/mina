import type { Context } from 'hono'

export const PRIVATE_CONTENT_READ_URL_EXPIRES_SECONDS = 900
export const PRIVATE_CONTENT_CACHE_MAX_AGE_SECONDS = 840
export const PRIVATE_CONTENT_CACHE_CONTROL = `private, max-age=${PRIVATE_CONTENT_CACHE_MAX_AGE_SECONDS}`
export const PRIVATE_CONTENT_VARY = 'Authorization, Cookie'

export const setPrivateContentRedirectHeaders = (c: Context): void => {
  c.header('Cache-Control', PRIVATE_CONTENT_CACHE_CONTROL)
  c.header('Vary', PRIVATE_CONTENT_VARY)
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Content-Type-Options', 'nosniff')
}

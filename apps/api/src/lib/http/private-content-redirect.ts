import type { Context } from 'hono'

export const setPrivateContentRedirectHeaders = (c: Context): void => {
  c.header('Cache-Control', 'private, no-store, max-age=0')
  c.header('Pragma', 'no-cache')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Content-Type-Options', 'nosniff')
}

import type { MinaLocale } from './locale'
import { minaBaseLocale, resolveLocale } from './locale'

export const MINA_LOCALE_HEADER = 'X-Mina-Locale'
export const MINA_LOCALE_COOKIE = 'mina_locale'

interface HonoLikeContext {
  get(key: string): unknown
  req: {
    header(name: string): string | undefined
  }
}

export const readCookieValue = (cookieHeader: string | undefined, name: string): string | undefined => {
  if (!cookieHeader) {
    return undefined
  }

  for (const segment of cookieHeader.split(';')) {
    const [key, ...rawValue] = segment.trim().split('=')
    if (key === name) {
      const value = rawValue.join('=')
      try {
        return decodeURIComponent(value)
      } catch {
        return value
      }
    }
  }

  return undefined
}

export const extractRequestLocale = (input: {
  acceptLanguage?: string | undefined
  cookie?: string | undefined
  headerLocale?: string | undefined
  userLocale?: string | undefined
}): MinaLocale =>
  resolveLocale({
    acceptLanguage: input.acceptLanguage,
    cookieLocale: readCookieValue(input.cookie, MINA_LOCALE_COOKIE),
    headerLocale: input.headerLocale,
    userLocale: input.userLocale,
  })

export const getRequestLocale = (c: HonoLikeContext): MinaLocale => {
  const value = c.get('locale') as MinaLocale | undefined
  return value ?? minaBaseLocale
}

export const resolveHonoRequestLocale = (c: HonoLikeContext): MinaLocale =>
  extractRequestLocale({
    acceptLanguage: c.req.header('Accept-Language'),
    cookie: c.req.header('Cookie'),
    headerLocale: c.req.header(MINA_LOCALE_HEADER),
  })

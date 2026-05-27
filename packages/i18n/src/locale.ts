import { z } from 'zod'

export const minaBaseLocale = 'en'
export const minaLocales = ['en', 'zh-Hans'] as const

export const MinaLocaleSchema = z.enum(minaLocales)

export type MinaLocale = (typeof minaLocales)[number]

const localeAliases = {
  'zh-cn': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  zh: 'zh-Hans',
} as const

export const isMinaLocale = (value: string | undefined): value is MinaLocale =>
  value !== undefined && minaLocales.includes(value as MinaLocale)

export const normalizeLocale = (value: string | undefined): MinaLocale | undefined => {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }

  if (isMinaLocale(normalized)) {
    return normalized
  }

  const lower = normalized.toLowerCase()
  if (lower in localeAliases) {
    return localeAliases[lower as keyof typeof localeAliases]
  }

  const baseLanguage = lower.split('-')[0]
  if (baseLanguage === 'en') {
    return 'en'
  }

  return undefined
}

const parseAcceptLanguage = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='))
      const weight = q ? Number.parseFloat(q.slice(2)) : 1
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0 }
    })
    .filter((entry) => entry.tag && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.tag) ?? []

export const resolveLocale = (input: {
  acceptLanguage?: string | undefined
  cookieLocale?: string | undefined
  headerLocale?: string | undefined
  userLocale?: string | undefined
}): MinaLocale => {
  const explicit = normalizeLocale(input.headerLocale) ?? normalizeLocale(input.userLocale) ?? normalizeLocale(input.cookieLocale)
  if (explicit) {
    return explicit
  }

  for (const language of parseAcceptLanguage(input.acceptLanguage)) {
    const locale = normalizeLocale(language)
    if (locale) {
      return locale
    }
  }

  return minaBaseLocale
}

export const localeToIntlLocale = (locale: MinaLocale): string => (locale === 'zh-Hans' ? 'zh-CN' : locale)

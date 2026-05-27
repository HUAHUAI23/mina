import { minaBaseLocale, normalizeLocale } from '@mina/i18n'
import type { MinaLocale } from '@mina/i18n'

export const localeStorageKey = 'mina.locale'

const browserStorage = (): Storage | undefined => {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export const readStoredLocale = (): MinaLocale | undefined => {
  const value = browserStorage()?.getItem(localeStorageKey) ?? undefined
  return normalizeLocale(value)
}

export const writeStoredLocale = (locale: MinaLocale): void => {
  browserStorage()?.setItem(localeStorageKey, locale)
}

export const detectBrowserLocale = (): MinaLocale => {
  if (typeof navigator === 'undefined') {
    return minaBaseLocale
  }

  for (const language of navigator.languages.length ? navigator.languages : [navigator.language]) {
    const locale = normalizeLocale(language)
    if (locale) {
      return locale
    }
  }

  return minaBaseLocale
}

export const getCurrentLocaleForRequest = (): MinaLocale => readStoredLocale() ?? detectBrowserLocale()

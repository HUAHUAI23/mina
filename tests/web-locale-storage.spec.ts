import { describe, expect, test } from 'bun:test'

import { detectBrowserLocale, getCurrentLocaleForRequest, localeStorageKey, readStoredLocale, writeStoredLocale } from '../apps/web/src/app/locale-storage'

const setNavigatorLanguages = (languages: readonly string[]) => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: languages[0] ?? 'en', languages },
  })
}

const setLocalStorage = () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  })
  return values
}

describe('web locale storage', () => {
  test('persists explicit locale choices', () => {
    const values = setLocalStorage()

    expect(readStoredLocale()).toBeUndefined()
    writeStoredLocale('zh-Hans')

    expect(values.get(localeStorageKey)).toBe('zh-Hans')
    expect(readStoredLocale()).toBe('zh-Hans')
  })

  test('uses browser languages when there is no stored locale', () => {
    setLocalStorage()
    setNavigatorLanguages(['fr-FR', 'zh-CN'])

    expect(detectBrowserLocale()).toBe('zh-Hans')
    expect(getCurrentLocaleForRequest()).toBe('zh-Hans')
  })
})

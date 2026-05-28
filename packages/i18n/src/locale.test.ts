import { describe, expect, test } from 'bun:test'

import { formatDateTime, formatNumber, formatRelativeTime } from './format'
import { normalizeLocale, resolveLocale } from './locale'

describe('locale helpers', () => {
  test('normalizes supported locale aliases', () => {
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('zh-CN')).toBe('zh-Hans')
    expect(normalizeLocale('zh-Hans')).toBe('zh-Hans')
    expect(normalizeLocale('fr-FR')).toBeUndefined()
  })

  test('resolves locale by explicit source priority', () => {
    expect(resolveLocale({ acceptLanguage: 'zh-CN, en;q=0.8' })).toBe('zh-Hans')
    expect(resolveLocale({ acceptLanguage: 'zh-CN', headerLocale: 'en-US' })).toBe('en')
    expect(resolveLocale({ cookieLocale: 'zh-Hans', headerLocale: 'fr-FR' })).toBe('zh-Hans')
    expect(resolveLocale({ acceptLanguage: 'fr-FR' })).toBe('en')
  })

  test('formats visible dates and numbers with locale policy', () => {
    expect(formatDateTime('2026-05-26T12:30:00.000Z', 'en')).toContain('2026')
    expect(formatDateTime('2026-05-26T12:30:00.000Z', 'zh-Hans')).toContain('2026')
    expect(formatNumber(1200, 'en')).toBe('1,200')
    expect(formatNumber(1200, 'zh-Hans')).toBe('1,200')
    expect(formatRelativeTime('2025-05-26T12:30:00.000Z', 'en', '2026-05-26T12:30:00.000Z')).toBe('1 year ago')
  })
})

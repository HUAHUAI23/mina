import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { MinaLocale } from '@mina/i18n'

import { bindMessages, type WebMessages } from '../lib/i18n-messages'
import { detectBrowserLocale, readStoredLocale, writeStoredLocale } from './locale-storage'

interface I18nContextValue {
  locale: MinaLocale
  messages: WebMessages
  setLocale(locale: MinaLocale): void
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

const resolveInitialLocale = (): MinaLocale => readStoredLocale() ?? detectBrowserLocale()

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<MinaLocale>(resolveInitialLocale)
  const messages = useMemo(() => bindMessages(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((nextLocale: MinaLocale) => {
    writeStoredLocale(nextLocale)
    setLocaleState(nextLocale)
  }, [])

  const value = useMemo<I18nContextValue>(() => ({ locale, messages, setLocale }), [locale, messages, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = (): I18nContextValue => {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider.')
  }
  return value
}

export const useMessages = (): WebMessages => useI18n().messages

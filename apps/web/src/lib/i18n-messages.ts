import { m as generatedMessages } from '@mina/i18n/messages'
import { minaBaseLocale, type MinaLocale } from '@mina/i18n'

export type WebMessages = typeof generatedMessages

export const bindMessages = (locale: MinaLocale): WebMessages =>
  new Proxy(generatedMessages, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') {
        return value
      }
      return (inputs?: unknown, options?: { locale?: MinaLocale }) => value(inputs, { ...options, locale })
    },
  }) as WebMessages

export const baseMessages = bindMessages(minaBaseLocale)

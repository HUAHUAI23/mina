import type { MinaLocale } from '@mina/i18n'

declare module 'hono' {
  interface ContextVariableMap {
    locale: MinaLocale
  }
}

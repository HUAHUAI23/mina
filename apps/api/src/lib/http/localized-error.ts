import type { LocalizedErrorDetails } from '@mina/contracts/schemas/api-error'
import { getApiErrorMessageKeyForCode, translateApiErrorMessage } from '@mina/i18n'
import type { ApiErrorMessageKey, MessageParams, MinaLocale } from '@mina/i18n'

export interface LocalizedErrorInput {
  code: string
  debugMessage?: string
  fallbackMessage: string
  locale?: MinaLocale
  messageKey?: ApiErrorMessageKey
  params?: MessageParams
}

export const createLocalizedErrorDetails = (input: LocalizedErrorInput): LocalizedErrorDetails => {
  const messageKey = input.messageKey ?? getApiErrorMessageKeyForCode(input.code)
  const message =
    input.locale && messageKey
      ? translateApiErrorMessage(messageKey, input.locale, input.params)
      : input.fallbackMessage

  return {
    code: input.code,
    message,
    ...(input.locale ? { locale: input.locale } : {}),
    ...(messageKey ? { messageKey } : {}),
    ...(input.params ? { params: input.params } : {}),
    ...(input.debugMessage ? { debugMessage: input.debugMessage } : {}),
  }
}

export const localizeErrorDetails = (
  error: LocalizedErrorDetails,
  locale: MinaLocale,
): LocalizedErrorDetails => {
  const messageKey = error.messageKey as ApiErrorMessageKey | undefined
  return createLocalizedErrorDetails({
    code: error.code,
    fallbackMessage: error.debugMessage ?? error.message,
    locale,
    ...(error.debugMessage ? { debugMessage: error.debugMessage } : {}),
    ...(messageKey ? { messageKey } : {}),
    ...(error.params ? { params: error.params } : {}),
  })
}

export const localizedErrorFromUnknown = (
  code: string,
  error: unknown,
  fallbackMessage: string,
  options: {
    messageKey?: ApiErrorMessageKey
    params?: MessageParams
  } = {},
): LocalizedErrorDetails => {
  const debugMessage = error instanceof Error ? error.message : typeof error === 'string' && error ? error : undefined
  return createLocalizedErrorDetails({
    code,
    fallbackMessage: debugMessage ?? String(error || fallbackMessage),
    ...(debugMessage ? { debugMessage } : {}),
    ...(options.messageKey ? { messageKey: options.messageKey } : {}),
    ...(options.params ? { params: options.params } : {}),
  })
}

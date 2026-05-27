import type { ApiError, ApiErrorParam, ApiValidationIssue } from '@mina/contracts/schemas/api-error'
import { getApiErrorMessageKeyForCode, translateApiErrorMessage } from '@mina/i18n'
import type { ApiErrorMessageKey, MinaLocale } from '@mina/i18n'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { createLocalizedErrorDetails } from './localized-error'

export type HttpErrorParams = Record<string, ApiErrorParam>

interface HttpErrorOptions {
  fallbackMessage: string
  issues?: ApiValidationIssue[]
  messageKey?: ApiErrorMessageKey
  params?: HttpErrorParams
}

const toOptions = (input: string | HttpErrorOptions): HttpErrorOptions =>
  typeof input === 'string' ? { fallbackMessage: input } : input

export class HttpError extends Error {
  public readonly fallbackMessage: string
  public readonly issues: ApiValidationIssue[] | undefined
  public readonly messageKey: ApiErrorMessageKey | undefined
  public readonly params: HttpErrorParams | undefined

  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    options: string | HttpErrorOptions,
  ) {
    const normalizedOptions = toOptions(options)

    super(normalizedOptions.fallbackMessage)
    this.name = 'HttpError'
    this.fallbackMessage = normalizedOptions.fallbackMessage
    this.messageKey = normalizedOptions.messageKey ?? getApiErrorMessageKeyForCode(code)
    this.params = normalizedOptions.params
    this.issues = normalizedOptions.issues
  }

  toLocalizedDetails(locale?: MinaLocale) {
    return createLocalizedErrorDetails({
      code: this.code,
      fallbackMessage: this.fallbackMessage,
      ...(locale ? { locale } : {}),
      ...(this.messageKey ? { messageKey: this.messageKey } : {}),
      ...(this.params ? { params: this.params } : {}),
    })
  }
}

export const createErrorPayload = (input: {
  code: string
  fallbackMessage: string
  issues?: ApiValidationIssue[]
  locale: MinaLocale
  messageKey?: ApiErrorMessageKey
  params?: HttpErrorParams
}): ApiError => {
  const message = input.messageKey
    ? translateApiErrorMessage(input.messageKey, input.locale, input.params)
    : input.fallbackMessage

  return {
    error: {
      code: input.code,
      message,
      locale: input.locale,
      ...(input.params ? { params: input.params } : {}),
      ...(input.issues ? { issues: input.issues } : {}),
    },
  }
}

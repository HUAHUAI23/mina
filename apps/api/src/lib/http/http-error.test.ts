import { describe, expect, test } from 'bun:test'

import { createErrorPayload, HttpError } from './http-error'

describe('http error payloads', () => {
  test('localizes known message keys while preserving stable codes', () => {
    const error = new HttpError(401, 'INVALID_CREDENTIALS', {
      fallbackMessage: 'Invalid username or password.',
      messageKey: 'api_error_auth_invalid_credentials',
    })
    const messageKey = error.messageKey
    expect(messageKey).toBe('api_error_auth_invalid_credentials')
    if (!messageKey) {
      throw new Error('Expected message key.')
    }

    const english = createErrorPayload({
      code: error.code,
      fallbackMessage: error.fallbackMessage,
      locale: 'en',
      messageKey,
    })
    const chinese = createErrorPayload({
      code: error.code,
      fallbackMessage: error.fallbackMessage,
      locale: 'zh-Hans',
      messageKey,
    })

    expect(english.error.code).toBe('INVALID_CREDENTIALS')
    expect(chinese.error.code).toBe('INVALID_CREDENTIALS')
    expect(english.error.message).toBe('Invalid username or password.')
    expect(chinese.error.message).toBe('用户名或密码错误。')
  })

  test('includes structured validation issues without requiring localized params', () => {
    const payload = createErrorPayload({
      code: 'VALIDATION_FAILED',
      fallbackMessage: 'The request is invalid.',
      issues: [{ code: 'REQUIRED', message: 'Invalid input', path: ['email'] }],
      locale: 'zh-Hans',
      messageKey: 'api_error_validation_failed',
    })

    expect(payload.error.message).toBe('请求参数无效。')
    expect(payload.error.issues).toEqual([{ code: 'REQUIRED', message: 'Invalid input', path: ['email'] }])
  })
})

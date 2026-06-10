import { describe, expect, test } from 'bun:test'

import { classifyChatAssistantError } from './chat-error-classifier'

describe('chat assistant error classifier', () => {
  test('classifies nested provider response status codes', () => {
    const classification = classifyChatAssistantError({
      message: 'Provider request failed.',
      response: {
        status: 429,
        statusText: 'Too Many Requests',
      },
    })

    expect(classification).toMatchObject({
      code: 'AI_PROVIDER_RATE_LIMITED',
      messageKey: 'chat_error_ai_provider_rate_limited',
      retryable: true,
    })
    expect(classification.debugMessage).toContain('Too Many Requests')
  })

  test('classifies nested network causes', () => {
    const classification = classifyChatAssistantError({
      message: 'AI stream failed.',
      cause: new Error('connect ENOTFOUND api.example.test'),
    })

    expect(classification).toMatchObject({
      code: 'AI_PROVIDER_NETWORK',
      messageKey: 'chat_error_ai_provider_network',
      retryable: true,
    })
    expect(classification.debugMessage).toContain('ENOTFOUND')
  })

  test('handles cyclic provider errors without leaking raw text into the user message', () => {
    const error: Record<string, unknown> = {
      message: 'SECRET_PROVIDER_FAILURE',
      statusCode: '503',
    }
    error.cause = error

    const classification = classifyChatAssistantError(error)

    expect(classification).toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'AI service is temporarily unavailable.',
      messageKey: 'chat_error_ai_provider_unavailable',
      retryable: true,
    })
    expect(classification.message).not.toContain('SECRET_PROVIDER_FAILURE')
    expect(classification.debugMessage).toContain('SECRET_PROVIDER_FAILURE')
  })
})

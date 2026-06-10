import { describe, expect, test } from 'bun:test'
import { bindMessages } from '../../../../lib/i18n-messages'

import { getChatErrorMessage } from './chat-error-message'

describe('chat error messages', () => {
  test('uses localized chat error message keys', () => {
    const messages = bindMessages('zh-Hans')

    expect(getChatErrorMessage({
      message: 'Network connection to the AI service failed.',
      messageKey: 'chat_error_ai_provider_network',
      type: 'error',
    }, messages)).toBe('连接 AI 服务时发生网络错误。Mina 会自动重试。')
  })

  test('falls back to the message for unknown keys', () => {
    const messages = bindMessages('en')

    expect(getChatErrorMessage({
      message: 'Fallback message.',
      messageKey: 'chat_error_future_code',
      type: 'error',
    }, messages)).toBe('Fallback message.')
  })
})

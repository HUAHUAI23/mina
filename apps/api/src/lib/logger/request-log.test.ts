import { describe, expect, test } from 'bun:test'

import { redactRequestLogMessage } from './request-log'

describe('request log redaction', () => {
  test('redacts token-like query params while keeping the route useful', () => {
    expect(redactRequestLogMessage('<-- GET /api/media-objects/media_1/content?token=session_secret&size=small')).toBe(
      '<-- GET /api/media-objects/media_1/content?token=[redacted]&size=small',
    )
    expect(redactRequestLogMessage('--> GET /api/callback?code=auth_code&access_token=access_secret 200 1ms')).toBe(
      '--> GET /api/callback?code=auth_code&access_token=[redacted] 200 1ms',
    )
  })
})

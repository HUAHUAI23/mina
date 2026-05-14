import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ApiError } from '@mina/contracts/modules/posts'

export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const createErrorPayload = (code: string, message: string): ApiError => ({
  error: {
    code,
    message,
  },
})

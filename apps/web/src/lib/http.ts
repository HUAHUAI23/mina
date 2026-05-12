import { ApiErrorSchema } from '@mina/contracts'

type Parser<T> = {
  parse(input: unknown): T
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export const getErrorMessage = (error: unknown, fallback = 'Something went wrong.'): string =>
  error instanceof Error ? error.message : fallback

export const readJson = async <T>(response: Response, schema: Parser<T>): Promise<T> => {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(payload)

    if (parsedError.success) {
      throw new ApiClientError(response.status, parsedError.data.error.code, parsedError.data.error.message)
    }

    throw new ApiClientError(response.status, 'HTTP_ERROR', `Request failed with status ${response.status}.`)
  }

  return schema.parse(payload)
}

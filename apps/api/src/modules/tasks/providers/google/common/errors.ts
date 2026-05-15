export interface GoogleProviderError extends Error {
  code?: number
  statusCode?: number
}

export const createGoogleProviderError = (
  message: string,
  options: { code?: number; statusCode?: number } = {},
): GoogleProviderError => {
  const error = new Error(message) as GoogleProviderError
  if (options.code !== undefined) {
    error.code = options.code
  }
  if (options.statusCode !== undefined) {
    error.statusCode = options.statusCode
  }
  return error
}

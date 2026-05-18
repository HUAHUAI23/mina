export interface VolcengineProviderError extends Error {
  code?: number
  statusCode?: number
}

export const createVolcengineProviderError = (
  message: string,
  options: { code?: number; statusCode?: number } = {},
): VolcengineProviderError => {
  const error = new Error(message) as VolcengineProviderError
  if (options.code !== undefined) {
    error.code = options.code
  }
  if (options.statusCode !== undefined) {
    error.statusCode = options.statusCode
  }
  return error
}

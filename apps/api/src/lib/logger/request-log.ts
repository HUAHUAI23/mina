const sensitiveQueryParamPattern = /([?&](?:access_token|id_token|refresh_token|token)=)[^&\s]+/gi

export const redactRequestLogMessage = (message: string): string =>
  message.replace(sensitiveQueryParamPattern, '$1[redacted]')

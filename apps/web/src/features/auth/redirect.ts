export const defaultAuthenticatedPath = '/projects'
export const loginPath = '/login'

export const sanitizeAuthRedirectPath = (redirectPath: string | undefined): string => {
  if (!redirectPath || !redirectPath.startsWith('/') || redirectPath.startsWith('//') || redirectPath.startsWith(loginPath)) {
    return defaultAuthenticatedPath
  }

  return redirectPath
}

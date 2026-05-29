import { useEffect } from 'react'

import { useAuth } from '../../auth/components/auth-provider'
import { useAccountProfile } from './use-account-queries'

export const useRefreshAuthenticatedUser = () => {
  const profileQuery = useAccountProfile()
  const { updateAuthenticatedUser, user } = useAuth()

  useEffect(() => {
    const profileUser = profileQuery.data?.user

    if (
      profileUser &&
      (user?.updatedAt !== profileUser.updatedAt ||
        user.avatarUrl !== profileUser.avatarUrl ||
        user.displayName !== profileUser.displayName ||
        user.preferredLocale !== profileUser.preferredLocale)
    ) {
      updateAuthenticatedUser(profileUser)
    }
  }, [
    profileQuery.data?.user,
    updateAuthenticatedUser,
    user?.avatarUrl,
    user?.displayName,
    user?.preferredLocale,
    user?.updatedAt,
  ])
}

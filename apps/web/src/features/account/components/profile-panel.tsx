import type { ChangeEvent, SubmitEvent } from 'react'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2 } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@mina/ui/components/avatar'
import { Button } from '@mina/ui/components/button'
import { Input } from '@mina/ui/components/input'
import { Label } from '@mina/ui/components/label'

import { useMessages } from '../../../app/i18n-provider'
import { getErrorMessage } from '../../../lib/http'
import { useAuth } from '../../auth/components/auth-provider'
import {
  updateAccountProfile,
  uploadAccountAvatar,
} from '../api/account.client'
import { accountKeys } from '../api/account-keys'
import { useAccountProfile } from '../hooks/use-account-queries'
import { AccountPageShell } from './account-page-shell'

const initialsFromName = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'M'

export function ProfilePanel() {
  const m = useMessages()
  const queryClient = useQueryClient()
  const { updateAuthenticatedUser, user: authUser } = useAuth()
  const profileQuery = useAccountProfile()
  const profile = profileQuery.data?.user ?? authUser
  const displayName = profile?.displayName ?? profile?.username ?? profile?.email ?? m.app_default_user()
  const [displayNameInput, setDisplayNameInput] = useState(displayName)

  useEffect(() => {
    setDisplayNameInput(displayName)
  }, [displayName])

  const profileMutation = useMutation({
    mutationFn: updateAccountProfile,
    onSuccess: (response) => {
      updateAuthenticatedUser(response.user)
      queryClient.setQueryData(accountKeys.profile(), response)
    },
  })

  const avatarMutation = useMutation({
    mutationFn: uploadAccountAvatar,
    onSuccess: (response) => {
      updateAuthenticatedUser(response.user)
      queryClient.setQueryData(accountKeys.profile(), response)
    },
  })

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextDisplayName = displayNameInput.trim()
    if (!nextDisplayName) {
      return
    }
    profileMutation.mutate({ displayName: nextDisplayName })
  }

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      avatarMutation.mutate(file)
    }
  }

  return (
    <AccountPageShell description={m.account_profile_description()} title={m.account_profile_title()}>
      <section className="grid gap-6 rounded-md border border-outline-ghost bg-surface-container-lowest p-6 shadow-floating max-md:p-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-16" size="lg">
            {profile?.avatarUrl ? <AvatarImage alt="" src={profile.avatarUrl} /> : null}
            <AvatarFallback className="bg-foreground text-sm font-extrabold text-primary-foreground">
              {initialsFromName(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 gap-1">
            <strong className="truncate text-base font-bold text-foreground">{displayName}</strong>
            <span className="truncate text-sm text-foreground-secondary">{profile?.email}</span>
          </div>
          <Label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-gray-100 px-3 text-sm font-bold text-foreground hover:text-brand-accent">
            {avatarMutation.isPending ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Camera aria-hidden="true" size={16} />}
            {m.account_profile_avatar_button()}
            <input
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={avatarMutation.isPending}
              onChange={handleAvatarChange}
              type="file"
            />
          </Label>
        </div>

        {avatarMutation.isError ? (
          <p className="m-0 rounded-md bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {getErrorMessage(avatarMutation.error)}
          </p>
        ) : null}

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground-secondary">{m.account_profile_display_name_label()}</span>
            <Input
              autoComplete="name"
              className="h-10 bg-surface-container-lowest"
              maxLength={120}
              minLength={1}
              onChange={(event) => setDisplayNameInput(event.target.value)}
              required
              value={displayNameInput}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground-secondary">{m.account_profile_email_label()}</span>
            <Input
              className="h-10 bg-surface-container-lowest text-foreground-secondary"
              disabled
              value={profile?.email ?? ''}
            />
          </label>

          {profileMutation.isError ? (
            <p className="m-0 rounded-md bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {getErrorMessage(profileMutation.error)}
            </p>
          ) : null}

          {profileMutation.isSuccess ? (
            <p className="m-0 rounded-md bg-brand-accent/10 p-3 text-sm font-semibold text-brand-accent">
              {m.account_profile_saved()}
            </p>
          ) : null}

          <Button className="h-10 justify-self-start rounded-md px-4" disabled={profileMutation.isPending} type="submit">
            {profileMutation.isPending ? m.account_saving() : m.account_save_changes()}
          </Button>
        </form>
      </section>
    </AccountPageShell>
  )
}

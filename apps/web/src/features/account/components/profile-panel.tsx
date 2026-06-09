import type { ChangeEvent, SubmitEvent } from 'react'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2 } from 'lucide-react'

import { Avatar, AvatarFallback } from '@mina/ui/components/avatar'
import { Input } from '@mina/ui/components/input'
import { Label } from '@mina/ui/components/label'

import { useMessages } from '../../../app/i18n-provider'
import { getErrorMessage } from '../../../lib/http'
import { MediaAvatarImage } from '../../../components/media/MediaAvatarImage'
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
      <section className="mx-auto grid w-full max-w-lg gap-5">
        <h2 className="m-0 text-center text-2xl font-normal leading-tight text-foreground">{m.account_nav_profile()}</h2>

        <div className="grid justify-items-center">
          <div className="relative">
            <Avatar className="size-40 shadow-floating">
              {profile?.avatarUpdatedAt ? (
                <MediaAvatarImage
                  alt=""
                  className="aspect-square size-full object-cover"
                  source={{ type: 'account_avatar', avatarUpdatedAt: profile.avatarUpdatedAt }}
                />
              ) : null}
              <AvatarFallback className="bg-foreground text-5xl font-normal text-primary-foreground">
                {initialsFromName(displayName)}
              </AvatarFallback>
            </Avatar>
            <Label
              aria-label={m.account_profile_avatar_button()}
              className="absolute right-1 bottom-1 inline-flex size-14 cursor-pointer items-center justify-center rounded-full border border-outline-ghost bg-surface-container-lowest text-foreground shadow-floating hover:bg-gray-100"
            >
              {avatarMutation.isPending ? <Loader2 aria-hidden="true" className="animate-spin" size={26} /> : <Camera aria-hidden="true" size={26} />}
              <input
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={avatarMutation.isPending}
                onChange={handleAvatarChange}
                type="file"
              />
            </Label>
          </div>
        </div>

        {avatarMutation.isError ? (
          <p className="m-0 rounded-md bg-destructive/10 p-3 text-sm font-normal text-destructive">
            {getErrorMessage(avatarMutation.error)}
          </p>
        ) : null}

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-normal text-foreground">{m.account_profile_display_name_label()}</span>
            <Input
              autoComplete="name"
              className="h-11 rounded-lg border-0 bg-gray-100 px-4 text-base font-normal text-foreground focus-visible:ring-0"
              maxLength={120}
              minLength={1}
              onChange={(event) => setDisplayNameInput(event.target.value)}
              required
              value={displayNameInput}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-normal text-foreground">{m.account_profile_email_label()}</span>
            <Input
              className="h-11 rounded-lg border-0 bg-gray-100 px-4 text-base font-normal text-foreground focus-visible:ring-0 disabled:bg-gray-100 disabled:text-foreground disabled:opacity-100"
              disabled
              value={profile?.email ?? ''}
            />
          </label>
          <button className="-mt-3 justify-self-end border-0 bg-transparent px-0 text-sm font-normal text-foreground-secondary hover:text-foreground" type="button">
            {m.account_profile_change_email()}
          </button>

          {profileMutation.isError ? (
            <p className="m-0 rounded-md bg-destructive/10 p-3 text-sm font-normal text-destructive">
              {getErrorMessage(profileMutation.error)}
            </p>
          ) : null}

          {profileMutation.isSuccess ? (
            <p className="m-0 rounded-md bg-brand-accent/10 p-3 text-sm font-normal text-brand-accent">
              {m.account_profile_saved()}
            </p>
          ) : null}

          <button
            className="h-11 rounded-lg border-0 bg-gray-100 px-4 text-base font-normal text-foreground-tertiary hover:bg-brand-accent hover:text-primary-foreground disabled:cursor-not-allowed disabled:text-foreground-quaternary disabled:hover:bg-gray-100 disabled:hover:text-foreground-quaternary"
            disabled={profileMutation.isPending}
            type="submit"
          >
            {profileMutation.isPending ? m.account_saving() : m.account_save_changes()}
          </button>
        </form>
      </section>
    </AccountPageShell>
  )
}

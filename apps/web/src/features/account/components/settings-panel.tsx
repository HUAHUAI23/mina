import type { SubmitEvent } from 'react'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MinaLocale } from '@mina/i18n'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mina/ui/components/select'

import { useI18n } from '../../../app/i18n-provider'
import { getErrorMessage } from '../../../lib/http'
import { useAuth } from '../../auth/components/auth-provider'
import { updateAccountPreferences } from '../api/account.client'
import { accountKeys } from '../api/account-keys'
import { AccountPageShell } from './account-page-shell'

const localeLabels: Record<MinaLocale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
}

const locales: MinaLocale[] = ['en', 'zh-Hans']

export function SettingsPanel() {
  const { locale, messages: m, setLocale } = useI18n()
  const queryClient = useQueryClient()
  const { updateAuthenticatedUser } = useAuth()
  const [selectedLocale, setSelectedLocale] = useState<MinaLocale>(locale)
  const [lastSavedLocale, setLastSavedLocale] = useState<MinaLocale>(locale)

  useEffect(() => {
    setSelectedLocale(locale)
  }, [locale])

  const mutation = useMutation({
    mutationFn: updateAccountPreferences,
    onSuccess: (response) => {
      updateAuthenticatedUser(response.user)
      queryClient.setQueryData(accountKeys.profile(), response)
      if (response.user.preferredLocale) {
        setLastSavedLocale(response.user.preferredLocale)
        setLocale(response.user.preferredLocale)
      }
    },
    onError: () => {
      setLocale(lastSavedLocale)
      setSelectedLocale(lastSavedLocale)
    },
  })

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selectedLocale === lastSavedLocale) {
      return
    }
    mutation.mutate({ preferredLocale: selectedLocale })
  }

  const handleLocaleChange = (nextLocale: MinaLocale) => {
    setSelectedLocale(nextLocale)
    setLocale(nextLocale)
  }

  return (
    <AccountPageShell description={m.account_settings_description()} title={m.account_settings_title()}>
      <section className="mx-auto grid w-full max-w-2xl gap-8">
        <h2 className="m-0 text-left text-3xl font-normal leading-tight text-foreground">{m.account_settings_title()}</h2>

        <form className="grid gap-6" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <span className="text-sm font-normal text-foreground">{m.account_settings_language_label()}</span>
            <Select
              disabled={mutation.isPending}
              onValueChange={(value) => handleLocaleChange(value as MinaLocale)}
              value={selectedLocale}
            >
              <SelectTrigger className="h-11 w-full rounded-lg border-0 bg-gray-100 px-4 text-base font-normal text-foreground focus-visible:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="w-[var(--radix-select-trigger-width)] bg-gray-100 p-1 shadow-floating ring-0" position="popper">
                {locales.map((option) => (
                  <SelectItem className="h-11 px-4 text-base font-normal focus:bg-gray-200" key={option} value={option}>
                    {localeLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-normal text-foreground">{m.account_settings_theme_label()}</span>
            <Select disabled value="light">
              <SelectTrigger className="h-11 w-full rounded-lg border-0 bg-gray-100 px-4 text-base font-normal text-foreground opacity-100 focus-visible:ring-0 disabled:opacity-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="w-[var(--radix-select-trigger-width)] bg-gray-100 p-1 shadow-floating ring-0" position="popper">
                <SelectItem className="h-11 px-4 text-base font-normal" value="light">
                  {m.account_settings_theme_light()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mutation.isError ? (
            <p className="m-0 rounded-md bg-destructive/10 p-3 text-sm font-normal text-destructive">
              {getErrorMessage(mutation.error)}
            </p>
          ) : null}

          <button
            className="mt-6 h-11 rounded-lg border-0 bg-gray-100 px-4 text-base font-normal text-foreground-tertiary hover:bg-brand-accent hover:text-primary-foreground disabled:cursor-not-allowed disabled:text-foreground-quaternary disabled:hover:bg-gray-100 disabled:hover:text-foreground-quaternary"
            disabled={mutation.isPending}
            type="submit"
          >
            {mutation.isPending ? m.account_saving() : m.account_settings_save_button()}
          </button>
        </form>
      </section>
    </AccountPageShell>
  )
}

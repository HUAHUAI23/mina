import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MinaLocale } from '@mina/i18n'
import { Languages } from 'lucide-react'

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

  const mutation = useMutation({
    mutationFn: updateAccountPreferences,
    onSuccess: (response) => {
      updateAuthenticatedUser(response.user)
      queryClient.setQueryData(accountKeys.profile(), response)
      if (response.user.preferredLocale) {
        setLocale(response.user.preferredLocale)
      }
    },
  })

  const handleLocaleChange = (nextLocale: MinaLocale) => {
    mutation.mutate({ preferredLocale: nextLocale })
  }

  return (
    <AccountPageShell description={m.account_settings_description()} title={m.account_settings_title()}>
      <section className="grid gap-6 rounded-md border border-outline-ghost bg-surface-container-lowest p-6 shadow-floating max-md:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-brand-accent/10 text-brand-accent">
            <Languages aria-hidden="true" size={18} />
          </span>
          <div className="grid min-w-0 gap-1">
            <strong className="text-sm font-bold text-foreground">{m.account_settings_language_title()}</strong>
            <span className="text-sm text-foreground-secondary">{m.account_settings_language_description()}</span>
          </div>
        </div>

        <div className="grid max-w-sm gap-2">
          <span className="text-sm font-bold text-foreground-secondary">{m.account_settings_language_label()}</span>
          <Select
            disabled={mutation.isPending}
            onValueChange={(value) => handleLocaleChange(value as MinaLocale)}
            value={locale}
          >
            <SelectTrigger className="h-10 w-full rounded-md bg-surface-container-lowest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((option) => (
                <SelectItem key={option} value={option}>
                  {localeLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {mutation.isError ? (
          <p className="m-0 rounded-md bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {getErrorMessage(mutation.error)}
          </p>
        ) : null}
      </section>
    </AccountPageShell>
  )
}

import type { SubmitEvent } from 'react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'

import { Button } from '@mina/ui/components/button'
import { Input } from '@mina/ui/components/input'

import { useMessages } from '../../../app/i18n-provider'
import { getErrorMessage } from '../../../lib/http'
import { changeAccountPassword } from '../api/account.client'
import { AccountPageShell } from './account-page-shell'

interface PasswordFormState {
  currentPassword: string
  newPassword: string
}

const initialForm: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
}

export function PasswordPanel() {
  const m = useMessages()
  const [form, setForm] = useState<PasswordFormState>(initialForm)

  const mutation = useMutation({
    mutationFn: changeAccountPassword,
    onSuccess: () => setForm(initialForm),
  })

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    mutation.mutate(form)
  }

  return (
    <AccountPageShell description={m.account_password_description()} title={m.account_password_title()}>
      <section className="grid gap-6 rounded-md border border-outline-ghost bg-surface-container-lowest p-6 shadow-floating max-md:p-5">
        <div className="flex items-center gap-3 text-brand-accent">
          <span className="flex size-9 items-center justify-center rounded-md bg-brand-accent/10">
            <KeyRound aria-hidden="true" size={18} />
          </span>
          <strong className="text-sm font-bold text-foreground">{m.account_password_panel_title()}</strong>
        </div>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground-secondary">{m.account_password_current_label()}</span>
            <Input
              autoComplete="current-password"
              className="h-10 bg-surface-container-lowest"
              maxLength={256}
              minLength={8}
              onChange={(event) => setForm((value) => ({ ...value, currentPassword: event.target.value }))}
              required
              type="password"
              value={form.currentPassword}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground-secondary">{m.account_password_new_label()}</span>
            <Input
              autoComplete="new-password"
              className="h-10 bg-surface-container-lowest"
              maxLength={256}
              minLength={8}
              onChange={(event) => setForm((value) => ({ ...value, newPassword: event.target.value }))}
              required
              type="password"
              value={form.newPassword}
            />
          </label>

          {mutation.isError ? (
            <p className="m-0 rounded-md bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {getErrorMessage(mutation.error)}
            </p>
          ) : null}

          {mutation.isSuccess ? (
            <p className="m-0 rounded-md bg-brand-accent/10 p-3 text-sm font-semibold text-brand-accent">
              {m.account_password_saved()}
            </p>
          ) : null}

          <Button className="h-10 justify-self-start rounded-md px-4" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? m.account_saving() : m.account_password_submit()}
          </Button>
        </form>
      </section>
    </AccountPageShell>
  )
}

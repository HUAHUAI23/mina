import type { SubmitEvent } from 'react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'

import { Input } from '@mina/ui/components/input'

import { useMessages } from '../../../app/i18n-provider'
import { getErrorMessage } from '../../../lib/http'
import { changeAccountPassword } from '../api/account.client'
import { AccountPageShell } from './account-page-shell'

interface PasswordFormState {
  confirmPassword: string
  currentPassword: string
  newPassword: string
}

const initialForm: PasswordFormState = {
  confirmPassword: '',
  currentPassword: '',
  newPassword: '',
}

type PasswordField = 'confirmPassword' | 'currentPassword' | 'newPassword'

interface PasswordInputFieldProps {
  autoComplete: string
  hidePasswordLabel: string
  label: string
  name: PasswordField
  onChange(value: string): void
  onToggle(): void
  show: boolean
  showPasswordLabel: string
  value: string
}

function PasswordInputField({
  autoComplete,
  hidePasswordLabel,
  label,
  name,
  onChange,
  onToggle,
  show,
  showPasswordLabel,
  value,
}: PasswordInputFieldProps) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-normal text-foreground">{label}</span>
      <span className="relative block">
        <Input
          autoComplete={autoComplete}
          className="h-11 rounded-lg border-0 bg-gray-100 px-4 pr-12 text-base font-normal text-foreground placeholder:text-foreground-tertiary focus-visible:ring-0"
          maxLength={256}
          minLength={8}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required
          type={show ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={show ? hidePasswordLabel : showPasswordLabel}
          className="absolute top-1/2 right-3 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent text-foreground-secondary hover:text-foreground"
          onClick={onToggle}
          type="button"
        >
          {show ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
        </button>
      </span>
    </label>
  )
}

export function PasswordPanel() {
  const m = useMessages()
  const [form, setForm] = useState<PasswordFormState>(initialForm)
  const [visibleFields, setVisibleFields] = useState<Record<PasswordField, boolean>>({
    confirmPassword: false,
    currentPassword: false,
    newPassword: false,
  })
  const [formError, setFormError] = useState<string | undefined>(undefined)

  const mutation = useMutation({
    mutationFn: changeAccountPassword,
    onSuccess: () => {
      setForm(initialForm)
      setFormError(undefined)
    },
  })

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      setFormError(m.account_password_mismatch())
      return
    }
    setFormError(undefined)
    mutation.mutate({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    })
  }

  return (
    <AccountPageShell description={m.account_password_description()} title={m.account_password_title()}>
      <section className="mx-auto grid w-full max-w-2xl gap-6">
        <h2 className="m-0 text-left text-3xl font-normal leading-tight text-foreground">{m.account_password_panel_title()}</h2>

        <form className="grid gap-6" onSubmit={handleSubmit}>
          <PasswordInputField
            autoComplete="current-password"
            hidePasswordLabel={m.auth_hide_password()}
            label={m.account_password_current_label()}
            name="currentPassword"
            onChange={(currentPassword) => setForm((value) => ({ ...value, currentPassword }))}
            onToggle={() => setVisibleFields((value) => ({ ...value, currentPassword: !value.currentPassword }))}
            show={visibleFields.currentPassword}
            showPasswordLabel={m.auth_show_password()}
            value={form.currentPassword}
          />
          <PasswordInputField
            autoComplete="new-password"
            hidePasswordLabel={m.auth_hide_password()}
            label={m.account_password_new_label()}
            name="newPassword"
            onChange={(newPassword) => setForm((value) => ({ ...value, newPassword }))}
            onToggle={() => setVisibleFields((value) => ({ ...value, newPassword: !value.newPassword }))}
            show={visibleFields.newPassword}
            showPasswordLabel={m.auth_show_password()}
            value={form.newPassword}
          />
          <PasswordInputField
            autoComplete="new-password"
            hidePasswordLabel={m.auth_hide_password()}
            label={m.account_password_confirm_label()}
            name="confirmPassword"
            onChange={(confirmPassword) => setForm((value) => ({ ...value, confirmPassword }))}
            onToggle={() => setVisibleFields((value) => ({ ...value, confirmPassword: !value.confirmPassword }))}
            show={visibleFields.confirmPassword}
            showPasswordLabel={m.auth_show_password()}
            value={form.confirmPassword}
          />

          {formError ? (
            <p className="m-0 rounded-md bg-destructive/10 p-3 text-sm font-normal text-destructive">
              {formError}
            </p>
          ) : null}

          {mutation.isError ? (
            <p className="m-0 rounded-md bg-destructive/10 p-3 text-sm font-normal text-destructive">
              {getErrorMessage(mutation.error)}
            </p>
          ) : null}

          {mutation.isSuccess ? (
            <p className="m-0 rounded-md bg-brand-accent/10 p-3 text-sm font-normal text-brand-accent">
              {m.account_password_saved()}
            </p>
          ) : null}

          <button
            className="mt-6 h-11 rounded-lg border-0 bg-gray-100 px-4 text-base font-normal text-foreground-tertiary hover:bg-brand-accent hover:text-primary-foreground disabled:cursor-not-allowed disabled:text-foreground-quaternary disabled:hover:bg-gray-100 disabled:hover:text-foreground-quaternary"
            disabled={mutation.isPending}
            type="submit"
          >
            {mutation.isPending ? m.account_saving() : m.account_password_submit()}
          </button>
        </form>
      </section>
    </AccountPageShell>
  )
}

import type { SubmitEvent } from 'react'
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, PanelTop, Sparkles, User, UserPlus, WandSparkles } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'

import { useI18n, useMessages } from '../../../app/i18n-provider'
import { LocaleSwitcher } from '../../../app/locale-switcher'
import { getErrorMessage } from '../../../lib/http'
import { loginWithPassword, registerWithPassword } from '../api/auth.client'
import { sanitizeAuthRedirectPath } from '../redirect'
import { useAuth } from './auth-provider'
import '../auth-page.css'

type AuthMode = 'login' | 'register'

interface LoginFormState {
  identifier: string
  password: string
}

interface RegisterFormState {
  displayName: string
  email: string
  password: string
  username: string
}

const initialLoginForm: LoginFormState = {
  identifier: '',
  password: '',
}

const initialRegisterForm: RegisterFormState = {
  displayName: '',
  email: '',
  password: '',
  username: '',
}

const authTabClassName = [
  'flex min-h-11 items-center justify-center gap-2 rounded-md border-0 bg-transparent text-sm font-extrabold text-foreground-tertiary',
  'data-[active=true]:bg-surface-container-lowest data-[active=true]:text-foreground data-[active=true]:shadow-sm',
].join(' ')
const authFieldShellClassName = [
  'flex min-h-12 items-center gap-2.5 rounded-md bg-surface-container-low px-3.5 text-foreground-quaternary',
  'ring-1 ring-inset ring-transparent focus-within:bg-surface-container-lowest focus-within:text-foreground-secondary focus-within:ring-outline-ghost focus-within:shadow-sm',
].join(' ')
const authInputClassName = 'w-full min-w-0 border-0 bg-transparent text-foreground outline-0 placeholder:text-foreground-quaternary'
const authIconButtonClassName = 'flex size-9 flex-none items-center justify-center rounded-full border-0 bg-transparent text-foreground-quaternary hover:bg-surface-container-low hover:text-foreground'
const authSubmitClassName = 'flex min-h-12 items-center justify-center gap-2.5 rounded-md border-0 bg-foreground px-5 font-black text-primary-foreground hover:bg-foreground-secondary disabled:cursor-not-allowed disabled:bg-foreground-faint disabled:text-surface-container-lowest'

interface AuthPageProps {
  redirectPath?: string | undefined
}

export function AuthPage({ redirectPath }: AuthPageProps) {
  const m = useMessages()
  const { setLocale } = useI18n()
  const { isAuthenticated, setAuthenticatedSession } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginForm)
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(initialRegisterForm)
  const resolvedRedirectPath = sanitizeAuthRedirectPath(redirectPath)

  const loginMutation = useMutation({
    mutationFn: loginWithPassword,
    onSuccess: (response) => {
      setAuthenticatedSession(response)
      if (response.user.preferredLocale) {
        setLocale(response.user.preferredLocale)
      }
      void navigate({ href: resolvedRedirectPath, replace: true })
    },
  })

  const registerMutation = useMutation({
    mutationFn: registerWithPassword,
    onSuccess: (response) => {
      setAuthenticatedSession(response)
      if (response.user.preferredLocale) {
        setLocale(response.user.preferredLocale)
      }
      void navigate({ href: resolvedRedirectPath, replace: true })
    },
  })

  useEffect(() => {
    if (isAuthenticated) {
      void navigate({ href: resolvedRedirectPath, replace: true })
    }
  }, [isAuthenticated, navigate, resolvedRedirectPath])

  if (isAuthenticated) {
    return null
  }

  const passwordInputType = showPassword ? 'text' : 'password'

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode)
    setShowPassword(false)
    loginMutation.reset()
    registerMutation.reset()
  }

  const handleLoginSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    loginMutation.mutate({
      identifier: loginForm.identifier.trim(),
      password: loginForm.password,
    })
  }

  const handleRegisterSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    registerMutation.mutate({
      displayName: registerForm.displayName.trim() || undefined,
      email: registerForm.email.trim(),
      password: registerForm.password,
      username: registerForm.username.trim(),
    })
  }

  return (
    <main className="mina-auth-page relative grid h-dvh w-screen grid-cols-[minmax(0,1fr)_minmax(22rem,32.5rem)] overflow-hidden bg-surface text-foreground max-lg:grid-cols-1">
      <section className="relative min-h-0 overflow-hidden p-8 max-lg:hidden" aria-hidden="true">
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div className="font-display flex items-center gap-3.5 text-sm font-black text-foreground">
            <div className="flex size-10 items-center justify-center rounded-md bg-foreground text-primary-foreground">
              <span className="font-display text-[0.48rem] font-extrabold tracking-[0.08em]">MINA</span>
            </div>
            <span>{m.auth_gate_brand_product()}</span>
          </div>

          <div className="mina-auth-studio-board mx-auto grid w-[min(100%,44rem)] grid-cols-[0.95fr_1.05fr] grid-rows-[6rem_9.5rem_6.5rem] gap-4 self-center">
            <div className="rounded-md bg-surface-container-lowest p-4 shadow-floating">
              <div className="mb-4 flex items-center gap-2 text-xs font-black text-foreground-quaternary">
                <PanelTop size={14} />
                {m.auth_visual_project_label()}
              </div>
              <div className="grid gap-2">
                <span className="h-3 w-3/4 rounded-sm bg-foreground" />
                <span className="h-2.5 w-11/12 rounded-sm bg-surface-container-high" />
                <span className="h-2.5 w-7/12 rounded-sm bg-surface-container-high" />
              </div>
            </div>
            <div className="row-span-2 rounded-md bg-surface-container-lowest p-4 shadow-floating">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-xs font-black text-foreground-quaternary">{m.auth_visual_canvas_label()}</span>
                <Sparkles className="text-brand-accent" size={16} />
              </div>
              <div className="grid h-52 place-items-center">
                <div className="relative size-44">
                  <span className="absolute left-0 top-5 grid h-16 w-24 place-items-center rounded-md bg-foreground text-[0.64rem] font-black text-primary-foreground">
                    {m.auth_visual_node_idea()}
                  </span>
                  <span className="absolute right-0 top-0 grid h-20 w-24 place-items-center rounded-md bg-gray-100 text-[0.64rem] font-black text-foreground-secondary">
                    {m.auth_visual_node_model()}
                  </span>
                  <span className="absolute bottom-0 left-10 grid h-20 w-28 place-items-center rounded-md bg-brand-accent text-[0.64rem] font-black text-primary-foreground">
                    {m.auth_visual_node_output()}
                  </span>
                  <span className="mina-auth-link mina-auth-link-a" />
                  <span className="mina-auth-link mina-auth-link-b" />
                </div>
              </div>
            </div>
            <div className="row-span-2 rounded-md bg-foreground p-4 text-primary-foreground shadow-floating">
              <div className="mb-10 flex items-center gap-2 text-xs font-black text-primary-foreground/70">
                <WandSparkles size={15} />
                {m.auth_visual_runtime_label()}
              </div>
              <div className="grid gap-3">
                <span className="h-3 w-5/6 rounded-sm bg-primary-foreground" />
                <span className="h-2.5 w-full rounded-sm bg-primary-foreground/25" />
                <span className="h-2.5 w-2/3 rounded-sm bg-primary-foreground/25" />
              </div>
            </div>
            <div className="rounded-md bg-surface-container-low p-4">
              <div className="mb-4 h-2.5 w-1/2 rounded-sm bg-foreground-faint" />
              <div className="grid grid-cols-3 gap-2">
                <span className="h-14 rounded-sm bg-surface-container-lowest" />
                <span className="h-14 rounded-sm bg-surface-container-lowest" />
                <span className="h-14 rounded-sm bg-surface-container-lowest" />
              </div>
            </div>
          </div>

          <div className="grid max-w-xl gap-3">
            <p className="m-0 text-xs font-black uppercase text-foreground-quaternary">{m.auth_page_kicker()}</p>
            <h2 className="font-display m-0 text-5xl font-black leading-none tracking-normal">{m.auth_page_visual_title()}</h2>
            <p className="m-0 max-w-lg text-base font-semibold leading-7 text-foreground-secondary">{m.auth_page_visual_body()}</p>
          </div>
        </div>
      </section>

      <section className="grid min-h-0 content-center overflow-y-auto bg-surface-container-lowest px-[clamp(1.375rem,4vw,4rem)] py-8 shadow-2xl max-lg:bg-transparent max-lg:shadow-none">
        <div className="grid w-full max-w-[28rem] justify-self-center gap-7">
          <div className="flex items-center justify-between gap-4">
            <div className="font-display flex items-center gap-3 text-sm font-black text-foreground">
              <div className="flex size-9 items-center justify-center rounded-md bg-foreground text-[0.46rem] font-extrabold tracking-[0.08em] text-primary-foreground">
                MINA
              </div>
              <span>{m.auth_gate_brand_product()}</span>
            </div>
            <LocaleSwitcher />
          </div>

          <div className="grid gap-2">
            <p className="m-0 text-xs font-black uppercase text-foreground-quaternary">
              {mode === 'login' ? m.auth_gate_login_eyebrow() : m.auth_gate_register_eyebrow()}
            </p>
            <h1 className="font-display m-0 text-4xl font-black leading-none tracking-normal max-md:text-3xl" id="mina-auth-title">
              {mode === 'login' ? m.auth_gate_login_title() : m.auth_gate_register_title()}
            </h1>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-md bg-surface-container-low p-1" role="tablist" aria-label={m.auth_gate_mode_label()}>
              <button
                aria-selected={mode === 'login'}
                className={authTabClassName}
                data-active={mode === 'login' ? 'true' : undefined}
                onClick={() => handleModeChange('login')}
                role="tab"
                type="button"
              >
                <User size={16} />
                {m.auth_login_tab()}
              </button>
              <button
                aria-selected={mode === 'register'}
                className={authTabClassName}
                data-active={mode === 'register' ? 'true' : undefined}
                onClick={() => handleModeChange('register')}
                role="tab"
                type="button"
              >
                <UserPlus size={16} />
                {m.auth_register_tab()}
              </button>
            </div>

            {mode === 'login' ? (
              <form className="grid gap-[15px]" onSubmit={handleLoginSubmit}>
                <label className="grid gap-2">
                  <span className="text-[0.72rem] font-black text-foreground-secondary">{m.auth_username_or_email_label()}</span>
                  <div className={authFieldShellClassName}>
                    <Mail aria-hidden="true" size={17} />
                    <input
                      className={authInputClassName}
                      autoComplete="username"
                      minLength={3}
                      onChange={(event) => setLoginForm((form) => ({ ...form, identifier: event.target.value }))}
                      placeholder="name@studio.com"
                      required
                      type="text"
                      value={loginForm.identifier}
                    />
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-[0.72rem] font-black text-foreground-secondary">{m.auth_password_label()}</span>
                  <div className={authFieldShellClassName}>
                    <KeyRound aria-hidden="true" size={17} />
                    <input
                      className={authInputClassName}
                      autoComplete="current-password"
                      maxLength={256}
                      minLength={8}
                      onChange={(event) => setLoginForm((form) => ({ ...form, password: event.target.value }))}
                      placeholder={m.auth_password_placeholder()}
                      required
                      type={passwordInputType}
                      value={loginForm.password}
                    />
                    <button
                      className={authIconButtonClassName}
                      aria-label={showPassword ? m.auth_hide_password() : m.auth_show_password()}
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                    </button>
                  </div>
                </label>

                {loginMutation.isError ? (
                  <p className="m-0 rounded-lg bg-destructive/10 p-3 text-[0.78rem] font-bold text-destructive">
                    {getErrorMessage(loginMutation.error)}
                  </p>
                ) : null}

                <button className={authSubmitClassName} disabled={loginMutation.isPending} type="submit">
                  {loginMutation.isPending ? m.auth_signing_in() : m.auth_sign_in_submit()}
                  <ArrowRight aria-hidden="true" size={18} />
                </button>
              </form>
            ) : (
              <form className="grid gap-[15px]" onSubmit={handleRegisterSubmit}>
                <label className="grid gap-2">
                  <span className="text-[0.72rem] font-black text-foreground-secondary">{m.auth_username_label()}</span>
                  <div className={authFieldShellClassName}>
                    <User aria-hidden="true" size={17} />
                    <input
                      className={authInputClassName}
                      autoComplete="username"
                      maxLength={64}
                      minLength={3}
                      onChange={(event) => setRegisterForm((form) => ({ ...form, username: event.target.value }))}
                      pattern="[a-zA-Z0-9_.-]+"
                      placeholder="studio-director"
                      required
                      type="text"
                      value={registerForm.username}
                    />
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-[0.72rem] font-black text-foreground-secondary">{m.auth_email_label()}</span>
                  <div className={authFieldShellClassName}>
                    <Mail aria-hidden="true" size={17} />
                    <input
                      className={authInputClassName}
                      autoComplete="email"
                      onChange={(event) => setRegisterForm((form) => ({ ...form, email: event.target.value }))}
                      placeholder="name@studio.com"
                      required
                      type="email"
                      value={registerForm.email}
                    />
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-[0.72rem] font-black text-foreground-secondary">{m.auth_display_name_label()}</span>
                  <div className={authFieldShellClassName}>
                    <User aria-hidden="true" size={17} />
                    <input
                      className={authInputClassName}
                      autoComplete="name"
                      maxLength={120}
                      onChange={(event) => setRegisterForm((form) => ({ ...form, displayName: event.target.value }))}
                      placeholder="Julian Reed"
                      type="text"
                      value={registerForm.displayName}
                    />
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-[0.72rem] font-black text-foreground-secondary">{m.auth_password_label()}</span>
                  <div className={authFieldShellClassName}>
                    <KeyRound aria-hidden="true" size={17} />
                    <input
                      className={authInputClassName}
                      autoComplete="new-password"
                      maxLength={256}
                      minLength={8}
                      onChange={(event) => setRegisterForm((form) => ({ ...form, password: event.target.value }))}
                      placeholder={m.auth_password_placeholder()}
                      required
                      type={passwordInputType}
                      value={registerForm.password}
                    />
                    <button
                      className={authIconButtonClassName}
                      aria-label={showPassword ? m.auth_hide_password() : m.auth_show_password()}
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                    </button>
                  </div>
                </label>

                {registerMutation.isError ? (
                  <p className="m-0 rounded-lg bg-destructive/10 p-3 text-[0.78rem] font-bold text-destructive">
                    {getErrorMessage(registerMutation.error)}
                  </p>
                ) : null}

                <button className={authSubmitClassName} disabled={registerMutation.isPending} type="submit">
                  {registerMutation.isPending ? m.auth_creating_account() : m.auth_create_account_submit()}
                  <ArrowRight aria-hidden="true" size={18} />
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
  )
}

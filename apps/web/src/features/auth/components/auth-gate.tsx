import type { FormEvent, PropsWithChildren } from 'react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, User, UserPlus } from 'lucide-react'

import { getErrorMessage } from '../../../lib/http'
import { loginWithPassword, registerWithPassword } from '../api/auth.client'
import { useAuth } from './auth-provider'
import '../auth-gate.css'

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

const authTabClassName = 'flex min-h-10.5 items-center justify-center gap-2 rounded-full border-0 bg-transparent text-[0.82rem] font-extrabold text-foreground-tertiary data-[active=true]:bg-surface-container-lowest data-[active=true]:text-foreground data-[active=true]:shadow-sm'
const authFieldShellClassName = 'flex min-h-12.5 items-center gap-2.5 rounded-xl bg-surface-container-high px-3.5 text-foreground-quaternary focus-within:bg-surface-container-lowest focus-within:text-foreground-secondary focus-within:shadow-sm'
const authInputClassName = 'w-full min-w-0 border-0 bg-transparent text-foreground outline-0 placeholder:text-foreground-quaternary'
const authIconButtonClassName = 'flex size-8.5 flex-none items-center justify-center rounded-full border-0 bg-transparent text-foreground-quaternary hover:bg-surface-container-low hover:text-foreground'
const authSubmitClassName = 'flex min-h-12.5 items-center justify-center gap-2.5 rounded-full border-0 bg-foreground px-5 font-black text-primary-foreground hover:bg-foreground-secondary disabled:cursor-not-allowed disabled:bg-foreground-faint disabled:text-surface-container-lowest'

export function AuthGate({ children }: PropsWithChildren) {
  const { isAuthenticated, setAuthenticatedSession } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginForm)
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(initialRegisterForm)

  const loginMutation = useMutation({
    mutationFn: loginWithPassword,
    onSuccess: setAuthenticatedSession,
  })

  const registerMutation = useMutation({
    mutationFn: registerWithPassword,
    onSuccess: setAuthenticatedSession,
  })

  if (isAuthenticated) {
    return children
  }

  const passwordInputType = showPassword ? 'text' : 'password'

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode)
    setShowPassword(false)
    loginMutation.reset()
    registerMutation.reset()
  }

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    loginMutation.mutate({
      identifier: loginForm.identifier.trim(),
      password: loginForm.password,
    })
  }

  const handleRegisterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    registerMutation.mutate({
      displayName: registerForm.displayName.trim() || undefined,
      email: registerForm.email.trim(),
      password: registerForm.password,
      username: registerForm.username.trim(),
    })
  }

  return (
    <div className="relative h-dvh w-screen overflow-hidden">
      <div className="mina-auth-underlay pointer-events-none h-full w-full select-none" aria-hidden="true">
        {children}
      </div>
      <div className="fixed inset-0 z-20 grid h-dvh w-screen place-items-center overflow-hidden p-[clamp(18px,4dvw,44px)] text-foreground max-md:p-3.5">
        <section
          className="grid min-h-[520px] w-[min(100%,820px)] max-w-[820px] grid-cols-[minmax(280px,0.86fr)_minmax(330px,1fr)] overflow-hidden rounded-2xl bg-surface-container-lowest shadow-2xl max-lg:max-w-[560px] max-lg:grid-cols-1 max-lg:min-h-0 max-md:max-h-[calc(100dvh-28px)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mina-auth-title"
        >
          <aside className="mina-auth-visual grid min-h-0 grid-rows-[auto_minmax(0,1fr)] p-7 max-lg:hidden" aria-hidden="true">
            <div className="font-display flex items-center gap-3.5 text-[0.84rem] font-black text-foreground">
              <div className="flex size-10 items-center justify-center rounded-[9px] bg-foreground text-primary-foreground">
                <span className="font-display text-[0.48rem] font-extrabold tracking-[0.08em]">MINA</span>
              </div>
              <span>Creative OS</span>
            </div>
            <div className="grid w-[min(100%,260px)] items-center justify-self-center self-center rounded-2xl bg-white/70 p-[18px] shadow-lg">
              <div className="mb-[18px] flex gap-2">
                <span className="size-2 rounded-full bg-surface-container-high" />
                <span className="size-2 rounded-full bg-surface-container-high" />
                <span className="size-2 rounded-full bg-surface-container-high" />
              </div>
              <div className="mina-auth-artboard-grid grid grid-cols-[1.05fr_0.95fr] grid-rows-[76px_58px_70px] gap-3">
                <span className="rounded-xl" data-tone="ink" />
                <span className="rounded-xl" data-tone="mist" />
                <span className="rounded-xl" data-tone="paper" />
                <span className="rounded-xl" data-tone="slate" />
              </div>
            </div>
          </aside>

          <section className="grid min-h-0 min-w-0 content-center gap-5 overflow-y-auto p-[clamp(30px,4dvw,48px)] max-md:px-[22px] max-md:py-7">
            <div className="grid gap-2">
              <p className="m-0 text-[0.68rem] font-black uppercase tracking-[0.24em] text-foreground-quaternary">
                {mode === 'login' ? 'Welcome back' : 'Create account'}
              </p>
              <h1 className="font-display m-0 text-[clamp(2rem,4.4dvw,2.9rem)] font-black leading-none tracking-normal max-md:text-3xl" id="mina-auth-title">
                {mode === 'login' ? 'Sign in to MINA' : 'Start with MINA'}
              </h1>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-container-low p-1" role="tablist" aria-label="Authentication mode">
              <button
                aria-selected={mode === 'login'}
                className={authTabClassName}
                data-active={mode === 'login' ? 'true' : undefined}
                onClick={() => handleModeChange('login')}
                role="tab"
                type="button"
              >
                <User size={16} />
                Login
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
                Register
              </button>
            </div>

            {mode === 'login' ? (
              <form className="grid gap-[15px]" onSubmit={handleLoginSubmit}>
                <label className="grid gap-2">
                  <span className="text-[0.72rem] font-black text-foreground-secondary">Username or email</span>
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
                  <span className="text-[0.72rem] font-black text-foreground-secondary">Password</span>
                  <div className={authFieldShellClassName}>
                    <KeyRound aria-hidden="true" size={17} />
                    <input
                      className={authInputClassName}
                      autoComplete="current-password"
                      maxLength={256}
                      minLength={8}
                      onChange={(event) => setLoginForm((form) => ({ ...form, password: event.target.value }))}
                      placeholder="Password"
                      required
                      type={passwordInputType}
                      value={loginForm.password}
                    />
                    <button
                      className={authIconButtonClassName}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                  {loginMutation.isPending ? 'Signing in' : 'Sign in'}
                  <ArrowRight aria-hidden="true" size={18} />
                </button>
              </form>
            ) : (
              <form className="grid gap-[15px]" onSubmit={handleRegisterSubmit}>
                <label className="grid gap-2">
                  <span className="text-[0.72rem] font-black text-foreground-secondary">Username</span>
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
                  <span className="text-[0.72rem] font-black text-foreground-secondary">Email</span>
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
                  <span className="text-[0.72rem] font-black text-foreground-secondary">Display name</span>
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
                  <span className="text-[0.72rem] font-black text-foreground-secondary">Password</span>
                  <div className={authFieldShellClassName}>
                    <KeyRound aria-hidden="true" size={17} />
                    <input
                      className={authInputClassName}
                      autoComplete="new-password"
                      maxLength={256}
                      minLength={8}
                      onChange={(event) => setRegisterForm((form) => ({ ...form, password: event.target.value }))}
                      placeholder="Password"
                      required
                      type={passwordInputType}
                      value={registerForm.password}
                    />
                    <button
                      className={authIconButtonClassName}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                  {registerMutation.isPending ? 'Creating account' : 'Create account'}
                  <ArrowRight aria-hidden="true" size={18} />
                </button>
              </form>
            )}
          </section>
        </section>
      </div>
    </div>
  )
}

import type { FormEvent, PropsWithChildren } from 'react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, Sparkles, User, UserPlus } from 'lucide-react'

import { getErrorMessage } from '../../../lib/http'
import { loginWithPassword, registerWithPassword } from '../api/auth.client'
import { useAuth } from './auth-provider'

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
    <main className="mina-auth-screen">
      <section className="mina-auth-card" aria-label="Authentication">
        <aside className="mina-auth-visual" aria-hidden="true">
          <div className="mina-auth-brand">
            <div className="mina-brand-mark">
              <span>MINA</span>
            </div>
            <span>Creative OS</span>
          </div>
          <div className="mina-auth-artboard">
            <div className="mina-auth-artboard-top">
              <span />
              <span />
              <span />
            </div>
            <div className="mina-auth-artboard-grid">
              <span data-tone="ink" />
              <span data-tone="mist" />
              <span data-tone="paper" />
              <span data-tone="slate" />
            </div>
          </div>
          <div className="mina-auth-visual-copy">
            <Sparkles size={18} strokeWidth={2.3} />
            <p>Design workspaces, canvases, and production assets stay connected under one session.</p>
          </div>
        </aside>

        <section className="mina-auth-panel">
          <div className="mina-auth-heading">
            <p>{mode === 'login' ? 'Welcome back' : 'Create account'}</p>
            <h1>{mode === 'login' ? 'Sign in to MINA' : 'Start with MINA'}</h1>
          </div>

          <div className="mina-auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              aria-selected={mode === 'login'}
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
            <form className="mina-auth-form" onSubmit={handleLoginSubmit}>
              <label className="mina-auth-field">
                <span>Username or email</span>
                <div>
                  <Mail aria-hidden="true" size={17} />
                  <input
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

              <label className="mina-auth-field">
                <span>Password</span>
                <div>
                  <KeyRound aria-hidden="true" size={17} />
                  <input
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
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((visible) => !visible)}
                    type="button"
                  >
                    {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                  </button>
                </div>
              </label>

              {loginMutation.isError ? <p className="mina-auth-error">{getErrorMessage(loginMutation.error)}</p> : null}

              <button className="mina-auth-submit" disabled={loginMutation.isPending} type="submit">
                {loginMutation.isPending ? 'Signing in' : 'Sign in'}
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </form>
          ) : (
            <form className="mina-auth-form" onSubmit={handleRegisterSubmit}>
              <label className="mina-auth-field">
                <span>Username</span>
                <div>
                  <User aria-hidden="true" size={17} />
                  <input
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

              <label className="mina-auth-field">
                <span>Email</span>
                <div>
                  <Mail aria-hidden="true" size={17} />
                  <input
                    autoComplete="email"
                    onChange={(event) => setRegisterForm((form) => ({ ...form, email: event.target.value }))}
                    placeholder="name@studio.com"
                    required
                    type="email"
                    value={registerForm.email}
                  />
                </div>
              </label>

              <label className="mina-auth-field">
                <span>Display name</span>
                <div>
                  <Sparkles aria-hidden="true" size={17} />
                  <input
                    autoComplete="name"
                    maxLength={120}
                    onChange={(event) => setRegisterForm((form) => ({ ...form, displayName: event.target.value }))}
                    placeholder="Julian Reed"
                    type="text"
                    value={registerForm.displayName}
                  />
                </div>
              </label>

              <label className="mina-auth-field">
                <span>Password</span>
                <div>
                  <KeyRound aria-hidden="true" size={17} />
                  <input
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
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((visible) => !visible)}
                    type="button"
                  >
                    {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                  </button>
                </div>
              </label>

              {registerMutation.isError ? (
                <p className="mina-auth-error">{getErrorMessage(registerMutation.error)}</p>
              ) : null}

              <button className="mina-auth-submit" disabled={registerMutation.isPending} type="submit">
                {registerMutation.isPending ? 'Creating account' : 'Create account'}
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </form>
          )}

        </section>
      </section>
    </main>
  )
}

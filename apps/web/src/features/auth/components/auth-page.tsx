import type { SubmitEvent } from 'react'
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, User, WandSparkles } from 'lucide-react'
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

const DiscordIcon = () => (
  <svg className="size-[18px] text-neutral-400 hover:text-neutral-800 transition-colors" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.094 13.094 0 0 1-1.873-.894.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.195.373.289a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z"/>
  </svg>
)

const XIcon = () => (
  <svg className="size-4 text-neutral-400 hover:text-neutral-800 transition-colors" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
)

const SketchCharacter = () => (
  <svg viewBox="0 0 400 300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-full max-w-[420px] text-neutral-800 mt-6 self-end">
    {/* Ground line */}
    <path d="M 15 275 C 130 268, 260 280, 385 272" strokeWidth="2.2" />

    {/* Workflow Canvas Nodes */}
    {/* Node 1: Prompt (Left) - Sticky-note/Prompt-box warm yellow fill */}
    <path d="M 35 45 L 125 47 L 122 95 L 32 93 Z" fill="#fffdf2" />
    <path d="M 39 49 L 121 51 L 118 91 L 36 89 Z" stroke="#dcdfdc" strokeWidth="1" strokeDasharray="3 3" fill="none" />
    {/* Prompt Title */}
    <path d="M 42 55 L 75 55" strokeWidth="2" />
    {/* Prompt content placeholder lines */}
    <path d="M 42 67 L 115 67 M 42 75 L 105 75 M 42 83 L 85 83" strokeWidth="1" opacity="0.6" />
    
    {/* Node 2: AI Model (Center) - Lavender/Purple fill representing AI brain */}
    <path d="M 185 30 L 285 33 L 282 85 L 182 82 Z" fill="#ece9fc" />
    <path d="M 189 34 L 281 37 L 278 81 L 186 78 Z" stroke="#cbbdfa" strokeWidth="1" strokeDasharray="3 3" fill="none" />
    {/* Model Title */}
    <path d="M 195 42 L 235 42" strokeWidth="2" />
    {/* Model chip shape outline */}
    <rect x="195" y="52" width="22" height="22" rx="4" strokeWidth="1.2" fill="#ffffff" />
    <path d="M 206 48 L 206 52 M 206 74 L 206 78 M 190 63 L 195 63 M 217 63 L 221 63" strokeWidth="1.2" />
    <path d="M 227 55 L 272 55 M 227 65 L 265 65 M 227 75 L 255 75" strokeWidth="1" opacity="0.6" />

    {/* Node 3: Visual Output (Right) - Sky blue landscape watercolor wash */}
    <path d="M 265 125 L 365 127 L 362 205 L 262 203 Z" fill="#f0f8ff" />
    <path d="M 269 129 L 361 131 L 358 201 L 266 199 Z" stroke="#bde0fd" strokeWidth="1" strokeDasharray="3 3" fill="none" />
    {/* Output Title */}
    <path d="M 275 137 L 315 137" strokeWidth="2" />
    {/* Landscape drawing inside output card */}
    <path d="M 275 190 L 295 160 L 315 180 L 335 150 L 352 190" strokeWidth="1" fill="#e8f8f5" opacity="0.7" />
    <path d="M 275 190 L 295 160 L 315 180 L 335 150 L 352 190" strokeWidth="1.2" />
    <circle cx="340" cy="165" r="5" strokeWidth="1" fill="#fff9db" />

    {/* Connection arrows */}
    {/* Connection 1: Prompt to Model */}
    <path d="M 125 70 C 145 70, 155 58, 182 58" stroke="var(--brand-accent)" strokeWidth="2" />
    <path d="M 175 54 L 182 58 L 175 62" stroke="var(--brand-accent)" strokeWidth="2" fill="var(--brand-accent)" />
    
    {/* Connection 2: Model to Output */}
    <path d="M 255 85 C 255 105, 275 110, 275 125" stroke="var(--brand-accent)" strokeWidth="2" />
    <path d="M 271 118 L 275 125 L 279 118" stroke="var(--brand-accent)" strokeWidth="2" fill="var(--brand-accent)" />

    {/* Character - Sitting and Connecting Nodes */}
    {/* Shirt / Dress watercolor wash */}
    <path d="M 80 212 C 100 220, 130 230, 160 245 C 160 245, 142 225, 125 210 C 110 222, 95 216, 80 212 Z" fill="#ffe5d9" opacity="0.85" />
    
    {/* Head */}
    <path d="M 92 185 C 102 180, 110 188, 112 198 C 114 208, 106 216, 96 218 C 86 220, 78 212, 76 202 C 74 192, 82 184, 92 185 Z" fill="#ffffff" />
    {/* Eyes & Smile */}
    <circle cx="86" cy="198" r="1.2" fill="currentColor" />
    <path d="M 82 204 C 86 208, 90 206, 92 202" />
    {/* Hair (messy curls) */}
    <path d="M 94 185 C 98 178, 105 178, 102 184 C 108 186, 108 194, 102 196" strokeWidth="1.2" />

    {/* Reclining Torso */}
    <path d="M 96 218 C 115 225, 145 235, 175 250" />
    <path d="M 80 212 C 100 220, 130 230, 160 245" />

    {/* Arm drawing connecting line */}
    {/* Reaching towards Prompt->Model connection line */}
    <path d="M 110 222 C 125 210, 140 195, 152 180" />
    <path d="M 100 216 C 118 202, 132 188, 145 174" />
    {/* Stylus / Pen */}
    <path d="M 148 171 L 160 162 M 158 174 L 160 162" strokeWidth="1.5" />
    
    {/* Idea Spark from stylus - custom magic brush sparks */}
    <polygon points="163,152 165,157 170,158 165,160 163,165 161,160 156,158 161,157" fill="#fad02c" stroke="none" />
    <circle cx="163" cy="158" r="1.5" fill="#fad02c" stroke="none" />
    <path d="M 162 154 L 165 158 M 168 162 L 172 165 M 158 158 L 162 162" strokeWidth="1.2" stroke="#e0a500" />

    {/* Reclining Legs */}
    <path d="M 175 250 L 255 255 C 265 256, 270 250, 268 240 L 265 235 C 262 225, 255 225, 240 230 L 190 240" fill="#f0f4f8" opacity="0.8" />
    <path d="M 175 250 L 255 255 C 265 256, 270 250, 268 240 L 265 235 C 262 225, 255 225, 240 230 L 190 240" />
    {/* Shoe 1 */}
    <path d="M 268 240 C 275 240, 285 245, 282 252 C 280 258, 268 258, 265 255" fill="currentColor" />

    {/* Reclining Leg 2 */}
    <path d="M 160 245 L 240 260 C 250 262, 255 256, 253 246 L 251 242 L 230 238" fill="#e1e8f0" opacity="0.8" />
    <path d="M 160 245 L 240 260 C 250 262, 255 256, 253 246 L 251 242 L 230 238" />
    {/* Shoe 2 */}
    <path d="M 253 246 C 260 246, 269 251, 266 258 C 263 264, 251 264, 248 260" fill="currentColor" stroke="none" />
    <path d="M 253 246 C 260 246, 269 251, 266 258 C 263 264, 251 264, 248 260" />
  </svg>
)

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
    <main className="mina-auth-page relative overflow-hidden font-sans">
      {/* LEFT SECTION (Form Card) */}
      <section className="mina-auth-left">
        {/* Decorative leafy plant at bottom left */}
        <svg width="100" height="180" viewBox="0 0 100 180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="absolute left-6 bottom-0 text-neutral-800/25 pointer-events-none max-lg:hidden">
          <path d="M5 175 L95 175" />
          <path d="M50 175 C50 120 40 60 45 15" strokeWidth="2.2" />
          <path d="M50 150 C30 145 20 130 25 115 C30 100 45 110 50 125" />
          <path d="M50 125 C70 120 80 105 75 90 C70 75 55 85 50 100" />
          <path d="M48 100 C28 95 18 80 23 65 C28 50 43 60 48 75" />
          <path d="M48 75 C68 70 78 55 73 40 C68 25 53 35 48 50" />
          <path d="M45 45 C30 40 25 25 30 15 C35 5 42 15 45 25" />
        </svg>

        {/* Decorative squiggle on left */}
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="absolute left-[4%] top-[45%] text-neutral-800/20 pointer-events-none max-lg:hidden sketch-animate-float">
          <path d="M20 20 C25 15 25 10 20 10 C15 10 12 15 15 20 C18 25 25 25 28 20 C31 15 29 7 20 5 C11 3 3 12 7 22 C11 32 25 35 32 30" />
        </svg>

        {/* Decorative star on bottom of card */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="absolute left-12 bottom-[10%] text-neutral-800/25 pointer-events-none max-lg:hidden">
          <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
        </svg>

        {/* Crisp form card */}
        <div className="mina-auth-card rounded-2xl p-8 max-sm:px-6">
          <div className="grid gap-5">
            {/* Logo Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7.5 items-center justify-center rounded-xl border-2 border-neutral-800 bg-transparent text-neutral-800">
                  <WandSparkles className="size-4.5" />
                </div>
                <span className="font-serif text-sm font-bold tracking-tight text-neutral-800">Mina</span>
              </div>
            </div>

            {/* Welcome Title */}
            <div className="text-left mt-2">
              <h1 className="font-serif text-3xl font-bold tracking-tight text-neutral-800" id="mina-auth-title">
                {mode === 'login' ? m.auth_gate_login_title() : m.auth_gate_register_title()}
              </h1>
            </div>

            {/* Inputs / Form */}
            {mode === 'login' ? (
              <form className="grid gap-[15px]" onSubmit={handleLoginSubmit}>
                <div className="grid gap-2">
                  <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-neutral-300 bg-white px-3.5 text-neutral-500 focus-within:border-neutral-800 transition-colors">
                    <Mail aria-hidden="true" size={16} />
                    <input
                      className="w-full min-w-0 border-0 bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400 text-sm"
                      autoComplete="username"
                      minLength={3}
                      onChange={(event) => setLoginForm((form) => ({ ...form, identifier: event.target.value }))}
                      placeholder="name@studio.com"
                      required
                      type="text"
                      value={loginForm.identifier}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-neutral-300 bg-white px-3.5 text-neutral-500 focus-within:border-neutral-800 transition-colors">
                    <KeyRound aria-hidden="true" size={16} />
                    <input
                      className="w-full min-w-0 border-0 bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400 text-sm"
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
                      className="flex size-7 flex-none items-center justify-center rounded-lg border-0 bg-transparent text-neutral-400 hover:text-neutral-800 transition-colors"
                      aria-label={showPassword ? m.auth_hide_password() : m.auth_show_password()}
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
                    </button>
                  </div>
                </div>

                {loginMutation.isError ? (
                  <p className="m-0 rounded-lg bg-destructive/10 p-3 text-[0.78rem] font-bold text-destructive">
                    {getErrorMessage(loginMutation.error)}
                  </p>
                ) : null}

                <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-0 bg-neutral-800 hover:bg-neutral-900 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-neutral-300" disabled={loginMutation.isPending} type="submit">
                  {loginMutation.isPending ? m.auth_signing_in() : m.auth_sign_in_submit()}
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              </form>
            ) : (
              <form className="grid gap-[15px]" onSubmit={handleRegisterSubmit}>
                <div className="grid gap-2">
                  <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-neutral-300 bg-white px-3.5 text-neutral-500 focus-within:border-neutral-800 transition-colors">
                    <User aria-hidden="true" size={16} />
                    <input
                      className="w-full min-w-0 border-0 bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400 text-sm"
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
                </div>

                <div className="grid gap-2">
                  <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-neutral-300 bg-white px-3.5 text-neutral-500 focus-within:border-neutral-800 transition-colors">
                    <Mail aria-hidden="true" size={16} />
                    <input
                      className="w-full min-w-0 border-0 bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400 text-sm"
                      autoComplete="email"
                      onChange={(event) => setRegisterForm((form) => ({ ...form, email: event.target.value }))}
                      placeholder="name@studio.com"
                      required
                      type="email"
                      value={registerForm.email}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-neutral-300 bg-white px-3.5 text-neutral-500 focus-within:border-neutral-800 transition-colors">
                    <User aria-hidden="true" size={16} />
                    <input
                      className="w-full min-w-0 border-0 bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400 text-sm"
                      autoComplete="name"
                      maxLength={120}
                      onChange={(event) => setRegisterForm((form) => ({ ...form, displayName: event.target.value }))}
                      placeholder="Julian Reed"
                      type="text"
                      value={registerForm.displayName}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-neutral-300 bg-white px-3.5 text-neutral-500 focus-within:border-neutral-800 transition-colors">
                    <KeyRound aria-hidden="true" size={16} />
                    <input
                      className="w-full min-w-0 border-0 bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400 text-sm"
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
                      className="flex size-7 flex-none items-center justify-center rounded-lg border-0 bg-transparent text-neutral-400 hover:text-neutral-800 transition-colors"
                      aria-label={showPassword ? m.auth_hide_password() : m.auth_show_password()}
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
                    </button>
                  </div>
                </div>

                {registerMutation.isError ? (
                  <p className="m-0 rounded-lg bg-destructive/10 p-3 text-[0.78rem] font-bold text-destructive">
                    {getErrorMessage(registerMutation.error)}
                  </p>
                ) : null}

                <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-0 bg-neutral-800 hover:bg-neutral-900 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-neutral-300" disabled={registerMutation.isPending} type="submit">
                  {registerMutation.isPending ? m.auth_creating_account() : m.auth_create_account_submit()}
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              </form>
            )}

            {/* Terms text */}
            <p className="text-[0.68rem] text-neutral-400 text-center leading-relaxed mt-1">
              {m.auth_login_tab() === '登录' ? (
                <>继续即表示你同意我们的 <a href="#" className="underline hover:text-neutral-600 transition-colors">服务条款</a> 和 <a href="#" className="underline hover:text-neutral-600 transition-colors">隐私政策</a></>
              ) : (
                <>By continuing, you agree to our <a href="#" className="underline hover:text-neutral-600 transition-colors">Terms of Service</a> and <a href="#" className="underline hover:text-neutral-600 transition-colors">Privacy Policy</a></>
              )}
            </p>

            {/* Footer switcher */}
            <div className="flex items-center justify-center text-xs text-neutral-400 mt-2">
              {mode === 'login' ? (
                <span className="flex items-center gap-1.5">
                  <span>{m.auth_register_tab() === '注册' ? '还没有账号？' : "Don't have an account?"}</span>
                  <button
                    onClick={() => handleModeChange('register')}
                    className="font-semibold text-brand-accent hover:underline focus:outline-none transition-colors"
                    type="button"
                  >
                    {m.auth_register_tab() === '注册' ? '立即加入' : m.auth_register_tab()}
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span>{m.auth_login_tab() === '登录' ? '已有账号？' : "Already have an account?"}</span>
                  <button
                    onClick={() => handleModeChange('login')}
                    className="font-semibold text-brand-accent hover:underline focus:outline-none transition-colors"
                    type="button"
                  >
                    {m.auth_login_tab() === '登录' ? '立即登录' : m.auth_login_tab()}
                  </button>
                </span>
              )}
            </div>

            {/* Brand Links Divider */}
            <div className="flex items-center justify-center gap-4 border-t border-neutral-100 pt-4 mt-2">
              <a href="#" aria-label="Discord" className="text-neutral-400 hover:text-neutral-800 transition-colors">
                <DiscordIcon />
              </a>
              <a href="#" aria-label="X" className="text-neutral-400 hover:text-neutral-800 transition-colors">
                <XIcon />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT SECTION (Serif text and Sketch Illustration) */}
      <section className="mina-auth-right">
        {/* Serif Headings Container with Traditional Seal */}
        <div className="flex items-start gap-4 pl-10 mb-4 max-w-lg">
          {/* Traditional Cinnabar Red Seal */}
          {m.auth_login_tab() === '登录' && (
            <div className="flex flex-none flex-col items-center justify-center border-2 border-[#c92a2a] bg-[#c92a2a] text-[10px] font-serif font-bold px-1.5 py-2 leading-none text-white rounded-[2px] shadow-sm select-none" style={{ writingMode: 'vertical-rl' }}>
              神笔马良
            </div>
          )}

          <div className="grid gap-1">
            <h2 className="font-serif text-[2.6rem] font-bold text-neutral-800 leading-tight tracking-wide">
              {m.auth_login_tab() === '登录' ? (
                <>执 AI 之神笔，<br />绘无限之画卷。</>
              ) : (
                <>Hold AI's magic brush,<br />paint the infinite canvas.</>
              )}
            </h2>
          </div>
        </div>

        {/* Sketch Illustration */}
        <SketchCharacter />
      </section>

      {/* Floating Locale Switcher */}
      <div className="absolute right-6 top-6 z-20">
        <LocaleSwitcher />
      </div>
    </main>
  )
}

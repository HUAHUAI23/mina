import type { PropsWithChildren } from 'react'
import { ChevronDown, LogOut, Search } from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'

import { cn } from '@mina/ui/lib/utils'

import { useAuth } from '../features/auth/components/auth-provider'
import { useI18n } from './i18n-provider'
import type { WebMessages } from '../lib/i18n-messages'

interface NavigationItem {
  disabled?: boolean
  label(messages: WebMessages): string
  to: string
}

const navigationItems: NavigationItem[] = [
  { label: (m) => m.app_nav_projects(), to: '/projects' },
  { disabled: true, label: (m) => m.app_nav_asset_hub(), to: '/projects' },
]

const shellClassName = [
  'grid h-dvh w-screen overflow-hidden bg-surface-container-lowest text-foreground',
  'lg:grid-cols-[18.4375rem_minmax(0,1fr)] max-lg:grid-rows-[auto_minmax(0,1fr)]',
].join(' ')

const sidebarClassName = [
  'flex min-h-0 min-w-0 flex-col border-outline-ghost bg-surface-container-lowest',
  'lg:border-r lg:px-5 lg:py-5',
  'max-lg:border-b max-lg:px-5 max-lg:py-4',
].join(' ')

const workspaceButtonClassName = [
  'flex h-12 w-full min-w-0 items-center justify-between gap-3 rounded-md border-0 bg-gray-100 px-3.5 text-left',
  'text-foreground hover:bg-gray-100 hover:text-brand-accent',
].join(' ')

const navLinkClassName = [
  'group flex h-9 w-full min-w-0 items-center rounded-none px-5 text-left text-sm font-bold',
].join(' ')

const activeNavLinkClassName = 'bg-gray-100 hover:bg-gray-100'
const activeNavTextClassName = 'text-brand-accent group-hover:text-brand-accent'
const disabledNavLinkClassName = 'cursor-not-allowed hover:bg-transparent'
const disabledNavTextClassName = 'text-foreground'
const inactiveNavLinkClassName = 'hover:bg-gray-100'
const inactiveNavTextClassName = 'text-foreground group-hover:text-brand-accent'

export function AppShell({ children }: PropsWithChildren) {
  const { messages: m } = useI18n()
  const { pathname } = useLocation()
  const { logout, user } = useAuth()
  const displayName = user?.displayName || user?.username || user?.email || m.app_default_user()
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2)

  return (
    <main className={shellClassName}>
      <aside aria-label={m.app_nav_label()} className={sidebarClassName}>
        <div className="grid gap-7 max-lg:grid-cols-2 max-lg:items-center max-md:grid-cols-1">
          <button className={workspaceButtonClassName} type="button">
            <span className="flex min-w-0 items-center gap-3">
              <span
                className="flex size-7 flex-none items-center justify-center rounded-sm border border-foreground-faint bg-surface-container-lowest text-xs font-black text-foreground-secondary"
                aria-hidden="true"
              >
                M
              </span>
              <span className="truncate text-sm font-medium">{m.app_workspace_name()}</span>
            </span>
            <ChevronDown aria-hidden="true" className="flex-none text-foreground-tertiary" size={17} />
          </button>

          <label
            className="flex h-10 min-w-0 items-center gap-3 rounded-md bg-gray-100 px-3.5 text-foreground-tertiary"
            htmlFor="mina-sidebar-search"
          >
            <span className="sr-only">{m.app_search_label()}</span>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-xs font-semibold text-foreground outline-0 placeholder:text-foreground-tertiary"
              id="mina-sidebar-search"
              placeholder={m.app_search_placeholder()}
              type="search"
            />
            <Search aria-hidden="true" className="flex-none" size={14} />
          </label>
        </div>

        <nav className="-mx-5 mt-6 grid gap-3 max-lg:mt-5 max-lg:flex max-lg:overflow-x-auto" aria-label={m.app_nav_label()}>
          {navigationItems.map(({ disabled = false, label: getLabel, to }) => {
            const active = !disabled && (pathname === to || pathname.startsWith(`${to}/`))
            const label = getLabel(m)

            if (disabled) {
              return (
                <button
                  aria-disabled="true"
                  className={cn(navLinkClassName, disabledNavLinkClassName, 'max-lg:flex-none')}
                  key={label}
                  type="button"
                >
                  <span className={cn('truncate', disabledNavTextClassName)}>{label}</span>
                </button>
              )
            }

            return (
              <Link
                aria-current={active ? 'page' : undefined}
                className={cn(navLinkClassName, active ? activeNavLinkClassName : inactiveNavLinkClassName, 'max-lg:flex-none')}
                key={label}
                to={to}
              >
                <span className={cn('truncate', active ? activeNavTextClassName : inactiveNavTextClassName)}>{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto grid gap-3 pt-6 max-lg:hidden">
          <section className="grid gap-3 rounded-md border border-brand-accent/20 bg-gray-100 p-4">
            <div className="grid gap-0.5">
              <p className="m-0 text-sm font-bold text-foreground-secondary">{m.app_subscription_label()}</p>
              <strong className="text-base leading-tight">{m.app_subscription_plan()}</strong>
            </div>
            <div className="h-px bg-brand-accent/20" aria-hidden="true" />
            <p className="m-0 text-sm leading-snug text-foreground-secondary">{m.app_subscription_body()}</p>
            <button
              className="h-8 justify-self-start rounded-md border-0 bg-brand-accent px-3.5 text-xs font-black text-primary-foreground hover:bg-brand-accent/90"
              type="button"
            >
              {m.app_subscription_upgrade()}
            </button>
          </section>

          <div className="flex min-h-14 items-center gap-3 border-t border-outline-ghost pt-3">
            <span
              className="flex size-10 flex-none items-center justify-center rounded-full bg-foreground text-xs font-extrabold text-primary-foreground"
              aria-hidden="true"
            >
              {initials || 'M'}
            </span>
            <strong className="min-w-0 flex-1 truncate text-sm leading-tight">{displayName}</strong>
            <button
              className="flex size-8 flex-none items-center justify-center rounded-full border-0 bg-transparent text-foreground-tertiary hover:bg-gray-100 hover:text-brand-accent"
              type="button"
              aria-label={m.app_sign_out()}
              onClick={logout}
            >
              <LogOut aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      </aside>

      <section className="min-h-0 min-w-0 overflow-hidden" aria-label={m.app_workspace_label()}>
        {children}
      </section>
    </main>
  )
}

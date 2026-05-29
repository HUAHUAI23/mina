import { useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { ArrowLeft, ChevronDown, CreditCard, Database, LogOut, Search, User } from 'lucide-react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@mina/ui/components/dropdown-menu'

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

const accountNavigationItems: NavigationItem[] = [
  { label: (m) => m.account_nav_profile(), to: '/account/profile' },
  { label: (m) => m.account_nav_password(), to: '/account/password' },
  { label: (m) => m.account_nav_storage(), to: '/account/storage' },
  { label: (m) => m.account_nav_billing(), to: '/account/billing' },
  { label: (m) => m.account_nav_settings(), to: '/account/settings' },
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
const defaultPanelPath = '/projects'

const isAccountPath = (path: string): boolean => path === '/account' || path.startsWith('/account/')

const isPanelPath = (path: string): boolean => !isAccountPath(path)

export function AppShell({ children }: PropsWithChildren) {
  const { messages: m } = useI18n()
  const { href, pathname } = useLocation()
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const accountMode = isAccountPath(pathname)
  const [panelPath, setPanelPath] = useState(defaultPanelPath)
  const displayName = user?.displayName || user?.username || user?.email || m.app_default_user()
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2)
  const sidebarNavigation = accountMode ? accountNavigationItems : navigationItems
  const navLabel = accountMode ? m.account_nav_label() : m.app_nav_label()
  const handleBackToPanel = () => {
    navigate({ href: panelPath })
  }
  const handleLogout = () => {
    logout()
    void navigate({
      search: { redirect: href },
      to: '/login',
    })
  }

  useEffect(() => {
    if (isPanelPath(pathname)) {
      setPanelPath(pathname)
    }
  }, [pathname])

  return (
    <main className={shellClassName}>
      <aside aria-label={navLabel} className={sidebarClassName}>
        <div className="grid gap-7 max-lg:grid-cols-2 max-lg:items-center max-md:grid-cols-1">
          {accountMode ? (
            <button className={workspaceButtonClassName} onClick={handleBackToPanel} type="button">
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className="flex size-7 flex-none items-center justify-center rounded-sm border border-foreground-faint bg-surface-container-lowest text-foreground-secondary"
                  aria-hidden="true"
                >
                  <ArrowLeft size={15} />
                </span>
                <span className="truncate text-sm font-medium">{m.account_back_to_panel()}</span>
              </span>
            </button>
          ) : (
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
          )}

          {!accountMode ? (
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
          ) : null}
        </div>

        <nav className="-mx-5 mt-6 grid gap-3 max-lg:mt-5 max-lg:flex max-lg:overflow-x-auto" aria-label={navLabel}>
          {sidebarNavigation.map(({ disabled = false, label: getLabel, to }) => {
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex min-h-14 w-full items-center gap-3 border-0 border-t border-outline-ghost bg-transparent pt-3 text-left text-foreground hover:text-brand-accent"
                type="button"
              >
                <span
                  className="flex size-10 flex-none items-center justify-center overflow-hidden rounded-full bg-foreground text-xs font-extrabold text-primary-foreground"
                  aria-hidden="true"
                >
                  {user?.avatarUrl ? <img alt="" className="size-full object-cover" src={user.avatarUrl} /> : initials || 'M'}
                </span>
                <strong className="min-w-0 flex-1 truncate text-sm leading-tight">{displayName}</strong>
                <ChevronDown aria-hidden="true" className="flex-none text-foreground-tertiary" size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 rounded-md border border-outline-ghost bg-surface-container-lowest p-2 shadow-floating"
              side="top"
              sideOffset={10}
            >
              <DropdownMenuItem asChild className="h-9 cursor-pointer px-3 font-bold hover:text-brand-accent focus:text-brand-accent">
                <Link to="/account/profile">
                  <User aria-hidden="true" size={16} />
                  {m.account_menu_your_account()}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="h-9 cursor-pointer px-3 font-bold hover:text-brand-accent focus:text-brand-accent">
                <Link to="/account/storage">
                  <Database aria-hidden="true" size={16} />
                  {m.account_menu_storage()}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="h-9 cursor-pointer px-3 font-bold hover:text-brand-accent focus:text-brand-accent">
                <Link to="/account/billing">
                  <CreditCard aria-hidden="true" size={16} />
                  {m.account_menu_billing()}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="h-9 cursor-pointer px-3 font-bold text-foreground hover:text-brand-accent focus:text-brand-accent"
                onSelect={handleLogout}
              >
                <LogOut aria-hidden="true" size={16} />
                {m.app_sign_out()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <section className="min-h-0 min-w-0 overflow-hidden" aria-label={m.app_workspace_label()}>
        {children}
      </section>
    </main>
  )
}

import type { PropsWithChildren } from 'react'
import { Archive, Compass, FolderOpen, LayoutGrid, Lightbulb, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'

import { cn } from '@mina/ui/lib/utils'

import { useAuth } from '../features/auth/components/auth-provider'
import { useMessages } from './i18n-provider'
import { LocaleSwitcher } from './locale-switcher'
import type { WebMessages } from '../lib/i18n-messages'

interface NavigationItem {
  icon: LucideIcon
  label(messages: WebMessages): string
  to: string
  routeEnabled?: boolean
}

const navigationItems: NavigationItem[] = [
  { icon: Compass, label: (m) => m.app_nav_plaza(), routeEnabled: true, to: '/' },
  { icon: Lightbulb, label: (m) => m.app_nav_ideas(), to: '/' },
  { icon: FolderOpen, label: (m) => m.app_nav_projects(), routeEnabled: true, to: '/projects' },
  { icon: LayoutGrid, label: (m) => m.app_nav_canvas(), routeEnabled: true, to: '/canvas' },
  { icon: Archive, label: (m) => m.app_nav_asset_hub(), to: '/' },
]

const recentProjects = [
  {
    id: 'neon-nights',
    name: 'Neon Nights OST',
    tone: 'dark',
    updatedAt: '2h ago',
  },
  {
    id: 'urban-decay',
    name: 'Urban Decay Doc',
    tone: 'light',
    updatedAt: '1d ago',
  },
] as const

const shellClassName = [
  'mina-app-shell-background grid h-dvh w-screen overflow-hidden text-foreground',
  'lg:grid-cols-[300px_minmax(0,1fr)] max-lg:grid-rows-[auto_minmax(0,1fr)] max-lg:grid-cols-1',
].join(' ')

const navIslandClassName = [
  'min-h-0 overflow-hidden bg-surface-container-lowest shadow-floating',
  'lg:my-[34px] lg:mr-0 lg:ml-[34px] lg:flex lg:flex-col lg:gap-[34px] lg:rounded-2xl lg:p-7',
  'max-lg:m-[18px] max-lg:grid max-lg:grid-cols-[auto_minmax(0,1fr)_auto] max-lg:items-center max-lg:gap-4 max-lg:rounded-2xl max-lg:p-[18px]',
  'max-md:grid-cols-1 max-md:items-stretch',
].join(' ')

const brandMarkClassName = 'flex size-10 items-center justify-center rounded-[9px] bg-foreground text-primary-foreground'
const navLinkClassName = 'flex min-h-11 items-center gap-3.5 rounded-lg px-4 text-foreground-tertiary hover:bg-surface-container-low hover:text-foreground'
const activeNavLinkClassName = 'bg-surface-container-low text-foreground font-[750] shadow-[inset_0_0_0_1px_var(--outline-ghost)]'

export function AppShell({ children }: PropsWithChildren) {
  const m = useMessages()
  const { pathname } = useLocation()
  const { logout, user } = useAuth()
  const displayName = user?.displayName || user?.username || user?.email || 'MINA User'
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2)
  const profileLabel = user?.role === 'admin' ? m.app_profile_admin() : m.app_profile_creative_director()

  return (
    <main className={shellClassName}>
      <aside aria-label={m.app_nav_label()} className={navIslandClassName}>
        <div className="flex items-center gap-3.5 max-md:justify-between">
          <div className={brandMarkClassName} aria-hidden="true">
            <span className="font-display text-[0.48rem] font-extrabold tracking-[0.08em]">MINA</span>
          </div>
          <span className="font-display text-[1.28rem] font-extrabold tracking-normal">MINA</span>
        </div>

        <section className="grid gap-[17px] max-lg:min-w-0">
          <h2 className="m-0 text-[0.68rem] font-extrabold uppercase tracking-[0.32em] text-foreground-quaternary max-md:hidden">
            {m.app_nav_heading()}
          </h2>
          <nav className="grid gap-2 max-lg:flex max-lg:gap-1.5 max-lg:overflow-x-auto">
            {navigationItems.map(({ icon: Icon, label: getLabel, routeEnabled = false, to }) => {
              const active = routeEnabled && (pathname === to || (to !== '/' && pathname.startsWith(to)))
              const label = getLabel(m)

              return (
                <Link
                  aria-current={active ? 'page' : undefined}
                  className={cn(navLinkClassName, 'max-lg:flex-none', active && activeNavLinkClassName)}
                  key={label}
                  to={to}
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
                  <span className="font-display text-[0.94rem]">{label}</span>
                </Link>
              )
            })}
          </nav>
        </section>

        <section className="grid gap-[17px] max-lg:hidden">
          <h2 className="m-0 text-[0.68rem] font-extrabold uppercase tracking-[0.32em] text-foreground-quaternary">
            {m.app_recent_projects()}
          </h2>
          <div className="grid gap-2">
            {recentProjects.map((project) => (
              <a className="flex min-w-0 items-center gap-3 rounded-md py-1" href="/" key={project.id}>
                <span
                  className={cn(
                    'font-display flex size-10 flex-none items-center justify-center rounded-lg bg-surface-container-low text-[0.38rem] font-extrabold tracking-[0.08em] text-primary-foreground',
                    project.tone === 'dark' && 'bg-foreground',
                  )}
                  aria-hidden="true"
                >
                  {project.tone === 'dark' ? 'MINA' : null}
                </span>
                <span className="group grid min-w-0 gap-0.5">
                  <strong className="truncate text-[0.78rem] leading-tight text-foreground-secondary group-hover:text-foreground">
                    {project.name}
                  </strong>
                  <span className="truncate text-[0.68rem] text-foreground-quaternary">{project.updatedAt}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        <button
          className="mt-auto min-h-11 rounded-lg border-0 bg-foreground px-4 text-[0.76rem] font-extrabold uppercase tracking-[0.12em] text-primary-foreground hover:bg-foreground-secondary max-lg:m-0 max-lg:px-[18px] max-md:hidden"
          type="button"
        >
          {m.app_new_project()}
        </button>
      </aside>

      <section
        className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-[38px_58px_30px] max-lg:p-[22px] max-md:p-[18px]"
        aria-label={m.app_workspace_label()}
      >
        <header className="flex items-center justify-between max-md:justify-end">
          <div aria-hidden="true" />
          <div className="flex items-center gap-3.5">
            <LocaleSwitcher className="max-md:h-10 max-md:px-2.5" compact />
            <div className="grid justify-items-end gap-px max-md:hidden">
              <strong className="text-[0.82rem] leading-tight">{displayName}</strong>
              <span className="text-[0.72rem] text-foreground-tertiary">{profileLabel}</span>
            </div>
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-[0.78rem] font-extrabold text-primary-foreground"
              aria-hidden="true"
            >
              {initials || 'M'}
            </div>
            <button
              className="flex size-10 items-center justify-center rounded-full border-0 bg-surface-container-low text-foreground-tertiary hover:bg-foreground hover:text-primary-foreground max-md:hidden"
              type="button"
              aria-label={m.app_sign_out()}
              onClick={logout}
            >
              <LogOut aria-hidden="true" size={17} />
            </button>
          </div>
        </header>

        <section className="grid min-h-0 min-w-0 overflow-hidden">{children}</section>

        <footer className="justify-self-end pr-2.5 text-[0.64rem] font-extrabold uppercase tracking-[0.4em] text-[color-mix(in_oklch,var(--foreground-quaternary)_45%,transparent)] max-md:justify-self-center max-md:p-0 max-md:text-center">
          {m.app_footer_notice()}
        </footer>
      </section>
    </main>
  )
}

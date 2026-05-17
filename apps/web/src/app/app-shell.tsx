import type { PropsWithChildren } from 'react'
import { Archive, Compass, FolderOpen, LayoutGrid, Lightbulb } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'

interface NavigationItem {
  icon: LucideIcon
  label: string
  to: string
  routeEnabled?: boolean
}

const navigationItems: NavigationItem[] = [
  { icon: Compass, label: 'Plaza', routeEnabled: true, to: '/' },
  { icon: Lightbulb, label: 'Ideas', to: '/' },
  { icon: FolderOpen, label: 'Projects', routeEnabled: true, to: '/projects' },
  { icon: LayoutGrid, label: 'Canvas', routeEnabled: true, to: '/canvas' },
  { icon: Archive, label: 'Asset Hub', to: '/' },
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

export function AppShell({ children }: PropsWithChildren) {
  const { pathname } = useLocation()

  return (
    <main className="mina-shell">
      <aside aria-label="Primary navigation" className="mina-nav-island">
        <div className="mina-brand">
          <div className="mina-brand-mark" aria-hidden="true">
            <span>MINA</span>
          </div>
          <span className="mina-brand-name">MINA</span>
        </div>

        <section className="mina-nav-section">
          <h2 className="mina-section-label">Navigate</h2>
          <nav className="mina-nav-list">
            {navigationItems.map(({ icon: Icon, label, routeEnabled = false, to }) => {
              const active = routeEnabled && (pathname === to || (to !== '/' && pathname.startsWith(to)))

              return (
                <Link
                  aria-current={active ? 'page' : undefined}
                  className="mina-nav-link"
                  data-active={active ? 'true' : undefined}
                  key={label}
                  to={to}
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
        </section>

        <section className="mina-nav-section">
          <h2 className="mina-section-label">Recent Projects</h2>
          <div className="mina-project-list">
            {recentProjects.map((project) => (
              <a className="mina-project-link" href="/" key={project.id}>
                <span className="mina-project-thumb" data-tone={project.tone} aria-hidden="true">
                  {project.tone === 'dark' ? 'MINA' : null}
                </span>
                <span className="mina-project-copy">
                  <strong>{project.name}</strong>
                  <span>{project.updatedAt}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        <button className="mina-new-project" type="button">
          New Project
        </button>
      </aside>

      <section className="mina-workspace" aria-label="Creative workspace">
        <header className="mina-topbar">
          <div aria-hidden="true" />
          <div className="mina-profile">
            <div>
              <strong>Julian Reed</strong>
              <span>Pro Director</span>
            </div>
            <div className="mina-avatar" aria-hidden="true">
              JR
            </div>
          </div>
        </header>

        <section className="mina-route-frame">{children}</section>

        <footer className="mina-verify-note">Verify production critical details.</footer>
      </section>
    </main>
  )
}

import {
  ArrowUp,
  Archive,
  Compass,
  FolderOpen,
  Lightbulb,
  Mic,
  Paperclip,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavigationItem {
  active: boolean
  icon: LucideIcon
  label: string
}

const navigationItems: NavigationItem[] = [
  { active: true, icon: Compass, label: 'Plaza' },
  { active: false, icon: Lightbulb, label: 'Ideas' },
  { active: false, icon: FolderOpen, label: 'Projects' },
  { active: false, icon: Archive, label: 'Asset Hub' },
  { active: false, icon: WalletCards, label: 'Billing' },
  { active: false, icon: Archive, label: 'Archive' },
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

export function PlazaPage() {
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
            {navigationItems.map(({ active, icon: Icon, label }) => (
              <a
                aria-current={active ? 'page' : undefined}
                className="mina-nav-link"
                data-active={active ? 'true' : undefined}
                href="/"
                key={label}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
                <span>{label}</span>
              </a>
            ))}
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

      <section className="mina-canvas" aria-label="Creative workspace">
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

        <section className="mina-hero" aria-labelledby="plaza-heading">
          <p className="mina-mode-pill">
            <span aria-hidden="true" />
            Director's Cut Mode Active
          </p>
          <div>
            <h1 id="plaza-heading">Welcome to MINA.</h1>
            <p>What are we creating today?</p>
          </div>
        </section>

        <form className="mina-composer" aria-label="Create prompt">
          <label className="sr-only" htmlFor="mina-prompt">
            Enter a story or script
          </label>
          <textarea id="mina-prompt" placeholder="Enter a story or script..." rows={1} />
          <div className="mina-composer-actions">
            <div className="mina-icon-actions">
              <button aria-label="Attach file" type="button">
                <Paperclip aria-hidden="true" size={18} />
              </button>
              <button aria-label="Use microphone" type="button">
                <Mic aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="mina-submit-actions">
              <span className="mina-tone-pill">
                <Sparkles aria-hidden="true" size={14} />
                Editorial Tone
              </span>
              <button aria-label="Submit prompt" className="mina-submit" type="submit">
                <ArrowUp aria-hidden="true" size={20} />
              </button>
            </div>
          </div>
        </form>

        <footer className="mina-verify-note">Verify production critical details.</footer>
      </section>
    </main>
  )
}

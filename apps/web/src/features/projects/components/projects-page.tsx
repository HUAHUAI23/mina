import { CirclePlus, Folder, Layers, MoreVertical } from 'lucide-react'

import '../projects-page.css'

const projectFolders = [
  {
    id: 'brand-campaign',
    accent: 'soft',
    canvasCount: 12,
    title: 'Brand Campaign 2024',
  },
  {
    id: 'short-film',
    accent: 'cool',
    canvasCount: 4,
    title: 'Short Film: Echo',
  },
] as const

const canvasItems = [
  {
    id: 'hero-sequence',
    status: 'In Progress',
    title: 'Hero Sequence_01',
    tone: 'lavender',
    updatedAt: 'Modified 2h ago',
  },
  {
    id: 'atmosphere-study',
    status: 'Draft',
    title: 'Atmosphere Study',
    tone: 'forest',
    updatedAt: 'Modified yesterday',
  },
  {
    id: 'character-silhouette',
    status: 'In Progress',
    title: 'Character Silhouette',
    tone: 'paper',
    updatedAt: 'Modified 3d ago',
  },
] as const

const pageClassName = 'grid min-h-0 min-w-0 content-start gap-[22px] overflow-y-auto [scrollbar-gutter:stable] py-[clamp(18px,3dvh,32px)] px-1 pb-[18px]'
const projectGridClassName = 'grid items-start justify-start gap-[26px] [grid-template-columns:repeat(auto-fill,178px)] max-lg:[grid-template-columns:repeat(auto-fill,minmax(164px,1fr))] max-md:grid-cols-1'
const folderCardClassName = 'relative z-0 flex h-[252px] min-w-0 flex-col justify-between rounded-2xl bg-surface-container-low p-5 shadow-sm'
const dashedCardClassName = 'flex min-h-[252px] min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-outline-ghost bg-transparent font-extrabold text-foreground-tertiary hover:border-foreground-quaternary hover:text-foreground'

export function ProjectsPage() {
  return (
    <div className={pageClassName}>
      <section className={projectGridClassName} aria-label="Projects and canvases">
        {projectFolders.map((folder) => (
          <article className={folderCardClassName} key={folder.id}>
            <div className="absolute inset-x-3.5 -top-2 -z-10 h-7 rounded-2xl bg-surface-container-high" aria-hidden="true" />
            <div
              className="mina-project-folder-icon flex size-10.5 items-center justify-center rounded-xl bg-surface-container-lowest text-foreground-tertiary"
              data-accent={folder.accent}
            >
              <Folder aria-hidden="true" size={26} fill="currentColor" strokeWidth={1.6} />
            </div>
            <div>
              <h2 className="font-display m-0 text-[0.96rem] leading-[1.18] text-foreground">{folder.title}</h2>
              <p className="mt-2 flex items-center gap-1.5 text-[0.66rem] uppercase text-foreground-tertiary">
                <Layers aria-hidden="true" size={14} />
                {folder.canvasCount} Canvases
              </p>
            </div>
          </article>
        ))}

        {canvasItems.map((item) => (
          <article
            className="h-[252px] min-w-0 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-floating"
            key={item.id}
          >
            <div
              className="mina-project-preview relative min-h-[158px] overflow-hidden"
              data-tone={item.tone}
            >
              <span className="relative z-10 m-3 inline-flex rounded-full bg-surface-container-lowest/80 px-2.5 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-foreground-tertiary">
                {item.status}
              </span>
            </div>
            <div className="flex items-start justify-between p-4">
              <div>
                <h2 className="font-display m-0 text-[0.96rem] leading-[1.18] text-foreground">{item.title}</h2>
                <p className="mt-2 text-[0.66rem] uppercase text-foreground-tertiary">{item.updatedAt}</p>
              </div>
              <button
                className="flex size-8.5 items-center justify-center rounded-full border-0 bg-transparent text-foreground-quaternary hover:bg-surface-container-low hover:text-foreground"
                aria-label={`More actions for ${item.title}`}
                type="button"
              >
                <MoreVertical aria-hidden="true" size={18} />
              </button>
            </div>
          </article>
        ))}

        <button
          className={dashedCardClassName}
          type="button"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-lowest">
            <CirclePlus aria-hidden="true" size={24} />
          </span>
          Quick Upload
        </button>
      </section>
    </div>
  )
}

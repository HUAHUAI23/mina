import { CirclePlus, Folder, Layers, MoreVertical } from 'lucide-react'

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

export function ProjectsPage() {
  return (
    <div className="mina-projects-page">
      <section className="mina-project-grid" aria-label="Projects and canvases">
        {projectFolders.map((folder) => (
          <article className="mina-folder-card" data-accent={folder.accent} key={folder.id}>
            <div className="mina-folder-stack" aria-hidden="true" />
            <div className="mina-folder-icon">
              <Folder aria-hidden="true" size={26} fill="currentColor" strokeWidth={1.6} />
            </div>
            <div>
              <h2>{folder.title}</h2>
              <p>
                <Layers aria-hidden="true" size={14} />
                {folder.canvasCount} Canvases
              </p>
            </div>
          </article>
        ))}

        {canvasItems.map((item) => (
          <article className="mina-canvas-card" key={item.id}>
            <div className="mina-canvas-preview" data-tone={item.tone}>
              <span>{item.status}</span>
            </div>
            <div className="mina-canvas-card-copy">
              <div>
                <h2>{item.title}</h2>
                <p>{item.updatedAt}</p>
              </div>
              <button aria-label={`More actions for ${item.title}`} type="button">
                <MoreVertical aria-hidden="true" size={18} />
              </button>
            </div>
          </article>
        ))}

        <button className="mina-upload-slot" type="button">
          <span>
            <CirclePlus aria-hidden="true" size={24} />
          </span>
          Quick Upload
        </button>
      </section>
    </div>
  )
}

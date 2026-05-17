import { Plus, Sparkles } from 'lucide-react'

const recentCanvases = [
  {
    id: 'mist',
    status: 'Rendering',
    title: 'Morning Mist Scene',
    tone: 'wave',
    updatedAt: 'Edited 12m ago',
  },
  {
    id: 'brutalism',
    status: 'In Progress',
    title: 'Brutalism Study 01',
    tone: 'interior',
    updatedAt: 'Edited 3h ago',
  },
  {
    id: 'editorial-grid',
    status: 'Draft',
    title: 'Editorial Grid Layout',
    tone: 'type',
    updatedAt: 'Edited 2d ago',
  },
] as const

export function CanvasPage() {
  return (
    <div className="mina-canvas-page">
      <section className="mina-canvas-section" aria-label="Canvases">
        <div className="mina-recent-canvas-grid">
          {recentCanvases.map((canvas) => (
            <article className="mina-recent-canvas-card" key={canvas.id}>
              <div className="mina-recent-preview" data-tone={canvas.tone}>
                <span>{canvas.status}</span>
              </div>
              <div>
                <h3>{canvas.title}</h3>
                <p>{canvas.updatedAt}</p>
              </div>
            </article>
          ))}

          <button className="mina-new-canvas-card" type="button">
            <span>
              <Plus aria-hidden="true" size={24} />
            </span>
            New Canvas
          </button>
        </div>
      </section>

      <button className="mina-floating-spark" aria-label="Generate new creative direction" type="button">
        <Sparkles aria-hidden="true" size={25} />
      </button>
    </div>
  )
}

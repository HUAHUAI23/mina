import { ArrowUp, Mic, Paperclip, Sparkles } from 'lucide-react'

export function PlazaPage() {
  return (
    <div className="mina-plaza-page">
      <section className="mina-hero" aria-labelledby="plaza-heading">
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
    </div>
  )
}

import { ArrowUp, Mic, Paperclip, Sparkles } from 'lucide-react'

import { useMessages } from '../../../app/i18n-provider'

export function PlazaPage() {
  const m = useMessages()

  return (
    <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
      <section
        className="grid min-h-0 content-center justify-items-center gap-[clamp(24px,4dvh,42px)] overflow-hidden py-[clamp(24px,5dvh,58px)] pb-[clamp(20px,4dvh,42px)] text-center max-md:gap-6 max-md:py-6 max-md:pb-[22px]"
        aria-labelledby="plaza-heading"
      >
        <div>
          <h1
            id="plaza-heading"
            className="font-display m-0 text-[clamp(3.6rem,min(7.4vw,12dvh),7rem)] font-extrabold leading-[0.95] tracking-normal max-md:text-[clamp(2.9rem,min(16vw,10dvh),5.2rem)]"
          >
            {m.plaza_heading()}
          </h1>
          <p className="font-display m-0 max-w-[9.5ch] text-[clamp(3.6rem,min(7.4vw,12dvh),7rem)] font-extrabold leading-[0.95] tracking-normal text-foreground-faint max-md:text-[clamp(2.9rem,min(16vw,10dvh),5.2rem)]">
            {m.plaza_prompt()}
          </p>
        </div>
      </section>

      <form
        className="mb-[clamp(8px,2dvh,22px)] grid w-[min(100%,820px)] max-w-[820px] justify-self-center rounded-2xl bg-surface-container-lowest p-5 px-[22px] shadow-floating"
        aria-label={m.plaza_create_prompt_label()}
      >
        <label className="sr-only" htmlFor="mina-prompt">
          {m.plaza_prompt_input_label()}
        </label>
        <textarea
          className="font-display min-h-8 resize-none border-0 bg-transparent text-base font-semibold text-foreground outline-0 placeholder:text-foreground-quaternary"
          id="mina-prompt"
          placeholder={m.plaza_prompt_placeholder()}
          rows={1}
        />
        <div className="flex items-center justify-between gap-4 max-md:items-stretch">
          <div className="flex items-center gap-2">
            <button
              className="flex size-10 items-center justify-center rounded-full border-0 bg-transparent text-foreground-quaternary hover:bg-surface-container-low hover:text-foreground"
              aria-label={m.plaza_attach_file()}
              type="button"
            >
              <Paperclip aria-hidden="true" size={18} />
            </button>
            <button
              className="flex size-10 items-center justify-center rounded-full border-0 bg-transparent text-foreground-quaternary hover:bg-surface-container-low hover:text-foreground"
              aria-label={m.plaza_use_microphone()}
              type="button"
            >
              <Mic aria-hidden="true" size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-[9px] rounded-full bg-surface-container-low px-4 py-2.5 text-[0.66rem] font-extrabold uppercase leading-none tracking-[0.28em] text-foreground-quaternary max-md:hidden">
              <Sparkles aria-hidden="true" size={14} />
              {m.plaza_editorial_tone()}
            </span>
            <button
              aria-label={m.plaza_submit_prompt()}
              className="flex h-12 w-12 items-center justify-center rounded-xl border-0 bg-foreground text-primary-foreground hover:bg-foreground-secondary"
              type="submit"
            >
              <ArrowUp aria-hidden="true" size={20} />
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

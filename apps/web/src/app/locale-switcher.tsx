import { Languages } from 'lucide-react'
import { minaLocales, normalizeLocale } from '@mina/i18n'
import type { MinaLocale } from '@mina/i18n'
import { cn } from '@mina/ui/lib/utils'

import { useI18n, useMessages } from './i18n-provider'

const localeLabelByLocale: Record<MinaLocale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
}

interface LocaleSwitcherProps {
  className?: string
  compact?: boolean
}

export function LocaleSwitcher({ className, compact = false }: LocaleSwitcherProps) {
  const { locale, setLocale } = useI18n()
  const m = useMessages()

  return (
    <label
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full bg-surface-container-low px-3 text-[0.72rem] font-extrabold text-foreground-tertiary',
        'focus-within:bg-surface-container-lowest focus-within:text-foreground focus-within:shadow-sm',
        className,
      )}
    >
      <Languages aria-hidden="true" size={15} />
      <span className={compact ? 'sr-only' : 'max-md:sr-only'}>{m.locale_switcher_label()}</span>
      <select
        aria-label={m.locale_switcher_label()}
        className="min-w-0 appearance-none border-0 bg-transparent font-extrabold text-foreground outline-0"
        onChange={(event) => {
          const nextLocale = normalizeLocale(event.target.value)
          if (nextLocale) {
            setLocale(nextLocale)
          }
        }}
        value={locale}
      >
        {minaLocales.map((option) => (
          <option key={option} value={option}>
            {localeLabelByLocale[option]}
          </option>
        ))}
      </select>
    </label>
  )
}

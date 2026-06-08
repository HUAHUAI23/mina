import { cn } from '@mina/ui/lib/utils'
import { Button } from '@mina/ui/components/button'
import { ArrowUp, Loader2 } from 'lucide-react'

import { useMessages } from '../../../../app/i18n-provider'

interface RunControlsProps {
  disabled?: boolean
  error?: string | undefined
  label?: string | undefined
  onRun(): void
  running?: boolean | undefined
  compact?: boolean | undefined
}

const runControlsClassName = 'mina-wc-run-controls flex min-w-0 items-center justify-between gap-2.5'
const runErrorClassName = 'm-0 min-w-0 text-[0.74rem] font-bold text-destructive'
const runButtonClassName = 'rounded-[13px] bg-[color-mix(in_oklch,var(--foreground)_86%,var(--primary))] px-4 text-[0.78rem] font-semibold text-primary-foreground shadow-sm hover:bg-foreground-secondary disabled:bg-surface-container-high disabled:text-foreground-quaternary disabled:shadow-none'
const fullRunButtonClassName = 'h-9'
const iconRunButtonClassName = 'flex size-[2.1rem] items-center justify-center rounded-full bg-foreground text-background shadow-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'

export function RunControls({ compact, disabled, error, label, onRun, running }: RunControlsProps) {
  const m = useMessages()
  const resolvedLabel = label ?? m.workflow_canvas_run()
  const disabledState = disabled || running

  if (compact) {
    return (
      <div className={cn(runControlsClassName, 'flex-none')}>
        {error ? <p className="sr-only">{error}</p> : null}
        <button
          aria-label={resolvedLabel}
          className={iconRunButtonClassName}
          disabled={disabledState}
          onClick={onRun}
          title={running ? m.workflow_canvas_running() : resolvedLabel}
          type="button"
        >
          {running ? (
            <Loader2 aria-hidden="true" className="size-[1.1rem] animate-spin" />
          ) : (
            <ArrowUp aria-hidden="true" className="size-[1.1rem]" />
          )}
        </button>
      </div>
    )
  }

  return (
    <div className={runControlsClassName}>
      {error ? <p className={runErrorClassName}>{error}</p> : null}
      <Button
        className={cn(runButtonClassName, fullRunButtonClassName)}
        disabled={disabledState}
        onClick={onRun}
        size="sm"
        type="button"
        variant="default"
      >
        {running ? m.workflow_canvas_running() : resolvedLabel}
      </Button>
    </div>
  )
}

import { Play, type LucideIcon } from 'lucide-react'
import { cn } from '@mina/ui/lib/utils'

import { useMessages } from '../../../../app/i18n-provider'

interface RunControlsProps {
  disabled?: boolean
  error?: string | undefined
  icon?: LucideIcon | undefined
  label?: string | undefined
  onRun(): void
  running?: boolean | undefined
  compact?: boolean | undefined
}

const runControlsClassName = 'mina-wc-run-controls flex items-center justify-between gap-2.5'
const runErrorClassName = 'm-0 text-[0.74rem] text-destructive'
const runButtonClassName = 'flex items-center border-0 bg-primary font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60'
const fullRunButtonClassName = 'min-h-8 gap-[7px] rounded-full px-[13px] text-[0.74rem]'
const compactRunButtonClassName = 'size-13 justify-center rounded-[22px] p-0 text-[0px] [&_svg]:size-5'

export function RunControls({ compact, disabled, error, icon: Icon = Play, label, onRun, running }: RunControlsProps) {
  const m = useMessages()
  const resolvedLabel = label ?? m.workflow_canvas_run()

  return (
    <div className={cn(runControlsClassName, compact && 'absolute right-0 bottom-0.5 ml-0')}>
      {error ? <p className={cn(runErrorClassName, compact && 'hidden')}>{error}</p> : null}
      <button
        className={cn(runButtonClassName, compact ? compactRunButtonClassName : fullRunButtonClassName)}
        disabled={disabled || running}
        onClick={onRun}
        type="button"
      >
        <Icon aria-hidden="true" size={15} />
        {running ? m.workflow_canvas_running() : resolvedLabel}
      </button>
    </div>
  )
}

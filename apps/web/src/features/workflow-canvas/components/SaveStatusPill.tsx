import { cn } from '@mina/ui/lib/utils'

import { useMessages } from '../../../app/i18n-provider'

interface SaveStatusPillProps {
  yjsConnectionStatus: 'connected' | 'connecting' | 'disconnected' | 'synced'
}

const statusDotClassNames: Record<SaveStatusPillProps['yjsConnectionStatus'], string> = {
  connected: 'bg-emerald-500/70 ring-2 ring-background',
  connecting: 'bg-amber-500/70 ring-2 ring-background',
  disconnected: 'bg-destructive/72 ring-2 ring-background',
  synced: 'bg-emerald-500/70 ring-2 ring-background',
}

export function SaveStatusPill({ yjsConnectionStatus }: SaveStatusPillProps) {
  const m = useMessages()
  const label = yjsConnectionStatus === 'synced'
    ? m.workflow_canvas_synced()
    : yjsConnectionStatus === 'disconnected'
      ? m.workflow_canvas_offline()
      : m.workflow_canvas_syncing()

  return (
    <div className="mina-wc-floating-surface flex min-h-10 flex-none items-center gap-2.5 rounded-full px-3.5 text-[0.7rem] font-black text-foreground-tertiary">
      <span aria-hidden="true" className={cn('size-[7px] rounded-full', statusDotClassNames[yjsConnectionStatus])} />
      {label}
    </div>
  )
}

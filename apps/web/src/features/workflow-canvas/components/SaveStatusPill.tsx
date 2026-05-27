import { cn } from '@mina/ui/lib/utils'

import { useMessages } from '../../../app/i18n-provider'

interface SaveStatusPillProps {
  yjsConnectionStatus: 'connected' | 'connecting' | 'disconnected' | 'synced'
}

const statusDotClassNames: Record<SaveStatusPillProps['yjsConnectionStatus'], string> = {
  connected: 'bg-green-500',
  connecting: 'bg-amber-500',
  disconnected: 'bg-red-500',
  synced: 'bg-green-500',
}

export function SaveStatusPill({ yjsConnectionStatus }: SaveStatusPillProps) {
  const m = useMessages()
  const label = yjsConnectionStatus === 'synced'
    ? m.workflow_canvas_synced()
    : yjsConnectionStatus === 'disconnected'
      ? m.workflow_canvas_offline()
      : m.workflow_canvas_syncing()

  return (
    <div className="flex min-h-10 flex-none items-center gap-2.5 rounded-full bg-surface-container-lowest/85 px-4 text-xs font-black text-foreground-tertiary shadow-[inset_0_0_0_1px_var(--outline-ghost)]">
      <span aria-hidden="true" className={cn('size-[7px] rounded-full', statusDotClassNames[yjsConnectionStatus])} />
      {label}
    </div>
  )
}

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
  const label = yjsConnectionStatus === 'synced'
    ? 'Synced'
    : yjsConnectionStatus === 'disconnected'
      ? 'Offline'
      : 'Syncing'

  return (
    <div className="flex min-h-10 flex-none items-center gap-2.5 rounded-full bg-surface-container-lowest/85 px-4 text-xs font-black text-foreground-tertiary shadow-[inset_0_0_0_1px_var(--outline-ghost)]">
      <span aria-hidden="true" className={`size-[7px] rounded-full ${statusDotClassNames[yjsConnectionStatus]}`} />
      {label}
    </div>
  )
}

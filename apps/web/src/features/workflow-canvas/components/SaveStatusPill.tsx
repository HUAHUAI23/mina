interface SaveStatusPillProps {
  dirty: boolean
  saving: boolean
  yjsConnectionStatus: 'connected' | 'connecting' | 'disconnected' | 'synced'
}

export function SaveStatusPill({ dirty, saving, yjsConnectionStatus }: SaveStatusPillProps) {
  const label = saving
    ? 'Saving'
    : yjsConnectionStatus === 'disconnected'
      ? 'Offline'
      : yjsConnectionStatus === 'connecting'
        ? 'Syncing'
        : dirty
          ? 'Unsaved'
          : 'Saved'

  return (
    <div className="mina-wc-save-pill" data-sync={yjsConnectionStatus}>
      <span aria-hidden="true" />
      {label}
    </div>
  )
}

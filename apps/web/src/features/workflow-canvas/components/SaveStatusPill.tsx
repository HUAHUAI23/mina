interface SaveStatusPillProps {
  yjsConnectionStatus: 'connected' | 'connecting' | 'disconnected' | 'synced'
}

export function SaveStatusPill({ yjsConnectionStatus }: SaveStatusPillProps) {
  const label = yjsConnectionStatus === 'synced'
    ? 'Synced'
    : yjsConnectionStatus === 'disconnected'
      ? 'Offline'
      : 'Syncing'

  return (
    <div className="mina-wc-save-pill" data-sync={yjsConnectionStatus}>
      <span aria-hidden="true" />
      {label}
    </div>
  )
}

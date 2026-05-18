interface RemoteUpdateBannerProps {
  onRefresh(): void
  version?: number | undefined
}

export function RemoteUpdateBanner({ onRefresh, version }: RemoteUpdateBannerProps) {
  return (
    <div className="mina-wc-remote-banner">
      <span>Remote update{version ? ` v${version}` : ''}</span>
      <button onClick={onRefresh} type="button">
        Refresh
      </button>
    </div>
  )
}

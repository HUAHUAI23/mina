interface RemoteUpdateBannerProps {
  onRefresh(): void
}

export function RemoteUpdateBanner({ onRefresh }: RemoteUpdateBannerProps) {
  return (
    <div className="mina-wc-remote-banner">
      <span>Remote update</span>
      <button onClick={onRefresh} type="button">
        Refresh
      </button>
    </div>
  )
}

export const VALID_STROKE = 'var(--mina-wc-primary)'
export const INVALID_STROKE = 'color-mix(in oklch, var(--destructive) 86%, var(--foreground))'
export const MEDIA_STROKE = 'var(--mina-wc-primary)'

export function getWorkflowConnectionPreviewStyle({
  connectionStatus,
  mediaPreview = false,
}: {
  connectionStatus: 'valid' | 'invalid' | null
  mediaPreview?: boolean
}) {
  return {
    stroke: connectionStatus === 'invalid'
      ? INVALID_STROKE
      : mediaPreview
        ? MEDIA_STROKE
        : VALID_STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2.4,
  }
}

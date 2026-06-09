import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useCallback } from 'react'

import type { ImageMediaSource } from './media-source'
import { imageSourceKey, resolveImageSource } from './media-source'
import { useRefreshableMediaUrl } from './refreshable-media'

export type MediaImageProps = Omit<ComponentPropsWithoutRef<'img'>, 'src'> & {
  fallback?: ReactNode | undefined
  maxRetries?: number | undefined
  source: ImageMediaSource
}

export function MediaImage({ fallback = null, maxRetries, onError, source, ...props }: MediaImageProps) {
  const media = useRefreshableMediaUrl({
    key: imageSourceKey(source),
    maxRetries,
    resolveUrl: useCallback((refreshNonce) => resolveImageSource(source, refreshNonce), [source]),
  })

  if (!media.src || media.failed) {
    return fallback
  }

  return (
    <img
      {...props}
      onError={(event) => {
        if (!media.refresh()) {
          onError?.(event)
        }
      }}
      src={media.src}
    />
  )
}

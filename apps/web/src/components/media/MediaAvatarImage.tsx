import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useCallback } from 'react'

import { AvatarImage } from '@mina/ui/components/avatar'

import type { ImageMediaSource } from './media-source'
import { imageSourceKey, resolveImageSource } from './media-source'
import { useRefreshableMediaUrl } from './refreshable-media'

export type MediaAvatarImageProps = Omit<ComponentPropsWithoutRef<typeof AvatarImage>, 'src'> & {
  fallback?: ReactNode | undefined
  maxRetries?: number | undefined
  source: ImageMediaSource
}

export function MediaAvatarImage({ fallback = null, maxRetries, onError, source, ...props }: MediaAvatarImageProps) {
  const media = useRefreshableMediaUrl({
    key: imageSourceKey(source),
    maxRetries,
    resolveUrl: useCallback((refreshNonce) => resolveImageSource(source, refreshNonce), [source]),
  })

  if (!media.src || media.failed) {
    return fallback
  }

  return (
    <AvatarImage
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

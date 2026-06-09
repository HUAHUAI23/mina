import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { previewUrlForMedia } from '../../lib/media-url'
import { useRefreshableMediaUrl } from './refreshable-media'

const STALLED_REFRESH_DELAY_MS = 4000

export type MediaVideoProps = Omit<ComponentPropsWithoutRef<'video'>, 'poster' | 'ref' | 'resource' | 'src'> & {
  fallback?: ReactNode | undefined
  maxRetries?: number | undefined
  posterResource?: NodeOutputResource | undefined
  ref?: Ref<HTMLVideoElement> | undefined
  resource: NodeOutputResource
}

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null): void => {
  if (!ref) {
    return
  }
  if (typeof ref === 'function') {
    ref(value)
    return
  }
  ;(ref as { current: T | null }).current = value
}

export function MediaVideo({
  fallback = null,
  maxRetries,
  onCanPlay,
  onError,
  onLoadedData,
  onStalled,
  onPlay,
  onPlaying,
  onProgress,
  posterResource,
  ref,
  resource,
  ...props
}: MediaVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stalledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousSrcRef = useRef<string | undefined>(undefined)
  const restorePlaybackRef = useRef<{ currentTime: number; wasPaused: boolean } | null>(null)
  const video = useRefreshableMediaUrl({
    key: `video:${resource.mediaObjectId ?? ''}:${resource.url}`,
    maxRetries,
    resolveUrl: useCallback((refreshNonce) => previewUrlForMedia(resource, refreshNonce), [resource]),
  })
  const poster = useRefreshableMediaUrl({
    key: `poster:${posterResource?.mediaObjectId ?? ''}:${posterResource?.url ?? ''}`,
    maxRetries,
    resolveUrl: useCallback((refreshNonce) => previewUrlForMedia(posterResource, refreshNonce), [posterResource]),
  })

  const clearStalledTimer = useCallback(() => {
    if (stalledTimerRef.current) {
      clearTimeout(stalledTimerRef.current)
      stalledTimerRef.current = null
    }
  }, [])

  const refreshVideo = useCallback((element: HTMLVideoElement | null): boolean => {
    if (element) {
      restorePlaybackRef.current = {
        currentTime: Number.isFinite(element.currentTime) ? element.currentTime : 0,
        wasPaused: element.paused,
      }
    }
    return video.refresh()
  }, [video])

  const scheduleStalledRefresh = useCallback((element: HTMLVideoElement) => {
    clearStalledTimer()
    const startCurrentTime = element.currentTime
    const startReadyState = element.readyState
    stalledTimerRef.current = setTimeout(() => {
      stalledTimerRef.current = null
      const current = videoRef.current
      if (!current) {
        return
      }
      if (current.error) {
        refreshVideo(current)
        return
      }
      if (current.readyState > startReadyState || current.currentTime !== startCurrentTime) {
        return
      }
      refreshVideo(current)
    }, STALLED_REFRESH_DELAY_MS)
  }, [clearStalledTimer, refreshVideo])

  useEffect(() => () => {
    clearStalledTimer()
  }, [clearStalledTimer])

  useEffect(() => {
    clearStalledTimer()
  }, [clearStalledTimer, video.src])

  useEffect(() => {
    const previousSrc = previousSrcRef.current
    previousSrcRef.current = video.src
    if (!video.src || !previousSrc || previousSrc === video.src) {
      return
    }

    const element = videoRef.current
    if (!element) {
      return
    }

    const restorePlayback = () => {
      const snapshot = restorePlaybackRef.current
      restorePlaybackRef.current = null
      if (!snapshot) {
        return
      }
      if (snapshot.currentTime > 0 && (!Number.isFinite(element.duration) || snapshot.currentTime < element.duration)) {
        element.currentTime = snapshot.currentTime
      }
      if (!snapshot.wasPaused) {
        void element.play().catch(() => undefined)
      }
    }

    element.addEventListener('loadedmetadata', restorePlayback, { once: true })
    element.load()

    return () => {
      element.removeEventListener('loadedmetadata', restorePlayback)
    }
  }, [video.src])

  if (!video.src || video.failed) {
    return fallback
  }

  return (
    <video
      {...props}
      {...(poster.src && !poster.failed ? { poster: poster.src } : {})}
      onCanPlay={(event) => {
        clearStalledTimer()
        onCanPlay?.(event)
      }}
      onError={(event) => {
        clearStalledTimer()
        if (!refreshVideo(event.currentTarget)) {
          onError?.(event)
        }
      }}
      onLoadedData={(event) => {
        clearStalledTimer()
        onLoadedData?.(event)
      }}
      onPlay={(event) => {
        onPlay?.(event)
      }}
      onPlaying={(event) => {
        clearStalledTimer()
        onPlaying?.(event)
      }}
      onProgress={(event) => {
        clearStalledTimer()
        onProgress?.(event)
      }}
      onStalled={(event) => {
        scheduleStalledRefresh(event.currentTarget)
        onStalled?.(event)
      }}
      ref={(node) => {
        videoRef.current = node
        assignRef(ref, node)
      }}
      src={video.src}
    />
  )
}

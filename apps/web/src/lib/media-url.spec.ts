import { describe, expect, test } from 'bun:test'

import {
  accountAvatarContentUrl,
  isProbablyPresignedStorageUrl,
  mediaObjectContentUrl,
  previewUrlForMedia,
} from './media-url'

const originalWindow = globalThis.window
const localStorageStore = new Map<string, string>()

const installBrowserWindow = (): void => {
  localStorageStore.clear()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        origin: 'https://app.example.test',
      },
      localStorage: {
        getItem: (key: string) => localStorageStore.get(key) ?? null,
        removeItem: (key: string) => {
          localStorageStore.delete(key)
        },
        setItem: (key: string, value: string) => {
          localStorageStore.set(key, value)
        },
      },
    },
  })
}

const restoreWindow = (): void => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  })
}

const withBrowserWindow = (run: () => void): void => {
  installBrowserWindow()
  try {
    run()
  } finally {
    restoreWindow()
  }
}

describe('media URL helpers', () => {
  test('returns stable media content URLs with auth token and refresh nonce', () => withBrowserWindow(() => {
    localStorageStore.set(
      'mina.auth.session',
      JSON.stringify({
        session: {
          expiresAt: '2999-01-01T00:00:00.000Z',
          id: 'session_1',
          token: 'token value token value token value',
          userId: 'user_1',
        },
        user: {
          createdAt: '2026-06-09T00:00:00.000Z',
          email: 'user@example.test',
          id: 'user_1',
          role: 'user',
          updatedAt: '2026-06-09T00:00:00.000Z',
        },
      }),
    )

    const url = new URL(mediaObjectContentUrl('media/1', 2))

    expect(url.origin).toBe('https://app.example.test')
    expect(url.pathname).toBe('/api/media-objects/media%2F1/content')
    expect(url.searchParams.get('token')).toBe('token value token value token value')
    expect(url.searchParams.get('_r')).toBe('2')
  }))

  test('returns account avatar content URLs only when an avatar version exists', () => withBrowserWindow(() => {
    expect(accountAvatarContentUrl(undefined)).toBeUndefined()
    expect(accountAvatarContentUrl({})).toBeUndefined()

    const url = new URL(accountAvatarContentUrl({ avatarUpdatedAt: '2026-06-09T00:00:00.000Z', refreshNonce: 1 }) ?? '')

    expect(url.pathname).toBe('/api/account/avatar/content')
    expect(url.searchParams.get('v')).toBe('2026-06-09T00:00:00.000Z')
    expect(url.searchParams.get('_r')).toBe('1')
  }))

  test('normalizes managed media resources to stable content URLs', () => withBrowserWindow(() => {
    expect(new URL(previewUrlForMedia({ mediaObjectId: 'media_1', url: 's3://bucket/key' }) ?? '').pathname).toBe(
      '/api/media-objects/media_1/content',
    )
    expect(new URL(previewUrlForMedia({ url: 'mina://media/media_2' }) ?? '').pathname).toBe(
      '/api/media-objects/media_2/content',
    )
  }))

  test('does not render probable direct presigned storage URLs as previews', () => withBrowserWindow(() => {
    const s3Url = 'https://bucket.s3.amazonaws.com/key?X-Amz-Credential=a&X-Amz-Signature=b&X-Amz-Expires=300'
    const r2Url = 'https://example.r2.cloudflarestorage.com/key?X-Amz-Signature=b'
    const cloudFrontUrl = 'https://cdn.example.test/key?Expires=1780980000&Signature=s&Key-Pair-Id=kp'
    const gcsUrl = 'https://storage.googleapis.com/bucket/key?X-Goog-Credential=a&X-Goog-Signature=b'
    const azureUrl = 'https://account.blob.core.windows.net/container/key?sv=2026-01-01&se=2999-01-01&sp=r&sig=s'
    const cosUrl = 'https://bucket.cos.ap-shanghai.myqcloud.com/key?q-ak=a&q-signature=s&q-sign-time=1;2'

    expect(isProbablyPresignedStorageUrl(s3Url)).toBe(true)
    expect(isProbablyPresignedStorageUrl(cloudFrontUrl)).toBe(true)
    expect(isProbablyPresignedStorageUrl(gcsUrl)).toBe(true)
    expect(isProbablyPresignedStorageUrl(azureUrl)).toBe(true)
    expect(isProbablyPresignedStorageUrl(cosUrl)).toBe(true)
    expect(isProbablyPresignedStorageUrl('https://cdn.example.test/image.png?width=200')).toBe(false)
    expect(previewUrlForMedia({ url: s3Url })).toBeUndefined()
    expect(previewUrlForMedia({ url: r2Url })).toBeUndefined()
    expect(previewUrlForMedia({ url: cloudFrontUrl })).toBeUndefined()
    expect(previewUrlForMedia({ url: 's3://bucket/key' })).toBeUndefined()
  }))
})

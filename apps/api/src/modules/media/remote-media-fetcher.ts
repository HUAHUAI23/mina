export interface RemoteMediaFetchInput {
  maxBytes: number
  timeoutMs: number
  url: string
}

export interface RemoteMediaFetchResult {
  body: Uint8Array
  byteSize: number
  contentType?: string
}

export interface RemoteMediaFetcher {
  fetch(input: RemoteMediaFetchInput): Promise<RemoteMediaFetchResult>
}

const bodyFromDataUrl = (url: string): RemoteMediaFetchResult => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url)
  if (!match) {
    throw new Error('Invalid data URL.')
  }

  const contentType = match[1] || undefined
  const isBase64 = match[2] === ';base64'
  const raw = match[3] ?? ''
  const body = isBase64
    ? Uint8Array.from(Buffer.from(raw, 'base64'))
    : new TextEncoder().encode(decodeURIComponent(raw))
  return {
    body,
    byteSize: body.byteLength,
    ...(contentType ? { contentType } : {}),
  }
}

export class FetchRemoteMediaFetcher implements RemoteMediaFetcher {
  async fetch(input: RemoteMediaFetchInput): Promise<RemoteMediaFetchResult> {
    if (input.url.startsWith('data:')) {
      const result = bodyFromDataUrl(input.url)
      if (result.byteSize > input.maxBytes) {
        throw new Error('Remote media exceeds the maximum allowed size.')
      }
      return result
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs)
    try {
      const response = await fetch(input.url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`Remote media fetch failed with HTTP ${response.status}.`)
      }
      const contentLength = response.headers.get('content-length')
      if (contentLength && Number(contentLength) > input.maxBytes) {
        throw new Error('Remote media exceeds the maximum allowed size.')
      }
      const body = new Uint8Array(await response.arrayBuffer())
      if (body.byteLength > input.maxBytes) {
        throw new Error('Remote media exceeds the maximum allowed size.')
      }
      const contentType = response.headers.get('content-type') ?? undefined
      return {
        body,
        byteSize: body.byteLength,
        ...(contentType ? { contentType } : {}),
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Remote media fetch timed out.')
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

import { extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PORT = '3000'

process.env.NODE_ENV ??= 'production'
process.env.PORT ??= process.env.MINA_API_PORT ?? DEFAULT_PORT
process.env.MINA_API_PORT ??= process.env.PORT

const staticRoot = resolve(fileURLToPath(new URL('../../apps/web/dist', import.meta.url)))
const indexFile = resolve(staticRoot, 'index.html')
const port = Number.parseInt(process.env.PORT, 10)

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`)
}

const apiServer = (await import('../../apps/api/src/index.ts')).default

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const isApiRoute = (pathname: string) =>
  pathname === '/api' || pathname.startsWith('/api/') || pathname === '/docs' || pathname === '/openapi.json'

const isSafeStaticPath = (candidate: string) => {
  const pathFromRoot = relative(staticRoot, candidate)
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !pathFromRoot.includes(`..${sep}`))
}

const responseHeaders = (filePath: string, pathname: string) => {
  const headers = new Headers()
  headers.set('Content-Type', contentTypes[extname(filePath)] ?? 'application/octet-stream')

  if (pathname.startsWith('/assets/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    headers.set('Cache-Control', 'no-cache')
  }

  return headers
}

const serveFile = async (filePath: string, pathname: string, method: string) => {
  const file = Bun.file(filePath)

  if (!(await file.exists())) {
    return undefined
  }

  return new Response(method === 'HEAD' ? null : file, {
    headers: responseHeaders(filePath, pathname),
  })
}

Bun.serve({
  hostname: '0.0.0.0',
  port,
  websocket: apiServer.websocket,
  async fetch(request, server) {
    const url = new URL(request.url)

    if (isApiRoute(url.pathname)) {
      return apiServer.fetch(request, server)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Not found', { status: 404 })
    }

    let decodedPath: string
    try {
      decodedPath = decodeURIComponent(url.pathname)
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const staticPath = resolve(staticRoot, `.${decodedPath}`)

    if (!isSafeStaticPath(staticPath)) {
      return new Response('Not found', { status: 404 })
    }

    const staticResponse = await serveFile(staticPath, url.pathname, request.method)

    if (staticResponse) {
      return staticResponse
    }

    if (extname(url.pathname)) {
      return new Response('Not found', { status: 404 })
    }

    return serveFile(indexFile, '/', request.method) ?? new Response('Web build not found', { status: 500 })
  },
})

console.log(`Mina web server listening on http://0.0.0.0:${port}`)

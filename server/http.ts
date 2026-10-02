import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { AddressInfo } from 'node:net'
import { validateSyncSnapshot } from '../src/lib/syncProtocol'
import { LocalDatabase, SCHEMA_VERSION, type LocalSpace, type SyncRequest } from './database'
import { LocalApiError } from './errors'

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
export const MAX_JSON_BYTES = 10 * 1024 * 1024
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const PHOTO_ID = /^sync-[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff'])
const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  response.end(body)
}

async function body(request: IncomingMessage, limit: number): Promise<Buffer> {
  const contentLength = request.headers['content-length']
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)) {
    request.resume()
    throw new LocalApiError(413, 'BODY_TOO_LARGE', 'The request body exceeds the local storage limit.')
  }
  return new Promise((accept, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let failed = false
    request.on('data', (chunk: Buffer) => {
      if (failed) return
      bytes += chunk.length
      if (bytes > limit) {
        failed = true
        chunks.length = 0
        reject(new LocalApiError(413, 'BODY_TOO_LARGE', 'The request body exceeds the local storage limit.'))
      } else chunks.push(chunk)
    })
    request.on('end', () => { if (!failed) accept(Buffer.concat(chunks)) })
    request.on('aborted', () => { if (!failed) reject(new LocalApiError(400, 'REQUEST_INTERRUPTED', 'The request was interrupted. Retry the same request.')) })
    request.on('error', () => { if (!failed) reject(new LocalApiError(400, 'REQUEST_INTERRUPTED', 'The request was interrupted. Retry the same request.')) })
  })
}

function validationSpace(request: IncomingMessage): LocalSpace {
  const space = request.headers['x-vesluma-space']
  if (request.headers['x-vesluma-local'] !== '1' || (space !== 'local-a' && space !== 'local-b')) {
    throw new LocalApiError(400, 'INVALID_LOCAL_CONTEXT', 'Select a local validation space and enable local sync.')
  }
  return space
}

function validateRequest(value: unknown): SyncRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LocalApiError(422, 'INVALID_REQUEST', 'Expected a sync request object.')
  const request = value as Record<string, unknown>
  if (Object.keys(request).some(key => !['requestId', 'clientId', 'sequence', 'snapshot'].includes(key))
    || typeof request.requestId !== 'string' || !SAFE_ID.test(request.requestId)
    || typeof request.clientId !== 'string' || !SAFE_ID.test(request.clientId)
    || !Number.isSafeInteger(request.sequence) || (request.sequence as number) < 0) {
    throw new LocalApiError(422, 'INVALID_REQUEST', 'The sync request identifiers or sequence are invalid.')
  }
  return { requestId: request.requestId, clientId: request.clientId, sequence: request.sequence as number, snapshot: validateSyncSnapshot(request.snapshot) }
}

function withinRoot(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
}

async function serveStatic(request: IncomingMessage, response: ServerResponse, path: string, distDir?: string): Promise<void> {
  if (!distDir) throw new LocalApiError(404, 'NOT_FOUND', 'The requested resource is not available.')
  const segments = path.split('/')
  // The existing offline worker reads this one generated manifest to discover hashed map assets.
  const buildManifest = path === '/.vite/manifest.json'
  if (path.includes('\\') || path.includes('\0') || segments.some(segment => segment === '..' || (segment.startsWith('.') && !buildManifest)) || path.includes(':')) {
    throw new LocalApiError(404, 'NOT_FOUND', 'The requested resource is not available.')
  }
  let root: string
  try { root = await realpath(distDir) } catch { throw new LocalApiError(503, 'APP_NOT_BUILT', 'Build the application before starting the local server.') }
  let candidate = resolve(root, `.${path === '/' ? '/index.html' : path}`)
  if (!withinRoot(root, candidate)) throw new LocalApiError(404, 'NOT_FOUND', 'The requested resource is not available.')
  let file: string
  try { file = await realpath(candidate) } catch {
    if (extname(path)) throw new LocalApiError(404, 'NOT_FOUND', 'The requested resource is not available.')
    candidate = resolve(root, 'index.html')
    try { file = await realpath(candidate) } catch { throw new LocalApiError(503, 'APP_NOT_BUILT', 'Build the application before starting the local server.') }
  }
  if (!withinRoot(root, file)) throw new LocalApiError(404, 'NOT_FOUND', 'The requested resource is not available.')
  const info = await stat(file)
  if (!info.isFile()) throw new LocalApiError(404, 'NOT_FOUND', 'The requested resource is not available.')
  response.writeHead(200, {
    'Content-Type': STATIC_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (request.method === 'HEAD') { response.end(); return }
  const stream = createReadStream(file)
  stream.on('error', () => response.destroy())
  stream.pipe(response)
}

export interface LocalServerOptions { dbPath: string; distDir?: string; port?: number }

/** The bind address is deliberately not configurable. This is not production authentication. */
export function createLocalServer(options: LocalServerOptions) {
  const port = options.port ?? 0
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Local server port must be an integer from 0 to 65535.')
  const db = new LocalDatabase(options.dbPath)
  const server = createServer({ maxHeaderSize: 16 * 1024 }, (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Referrer-Policy', 'same-origin')
    response.setHeader('Cache-Control', 'no-store')
    void (async () => {
      const address = server.address() as AddressInfo
      const host = request.headers.host
      if (host !== `127.0.0.1:${address.port}` && host !== `localhost:${address.port}`) {
        throw new LocalApiError(403, 'INVALID_HOST', 'Use the local loopback server address.')
      }
      const origin = request.headers.origin
      if ((origin !== undefined && origin !== `http://${host}`) || request.headers['sec-fetch-site'] === 'cross-site') {
        throw new LocalApiError(403, 'INVALID_ORIGIN', 'Requests must come from the same local application origin.')
      }
      if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new LocalApiError(400, 'INVALID_URL', 'The request URL is invalid.')
      let path: string
      try { path = decodeURIComponent(request.url.split('?')[0]) } catch { throw new LocalApiError(400, 'INVALID_URL', 'The request URL is invalid.') }
      if (path === '/api/health') {
        if (request.method !== 'GET') throw new LocalApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.')
        json(response, 200, { ok: true, mode: 'local-only', schemaVersion: SCHEMA_VERSION })
        return
      }
      if (path === '/api/sync') {
        const space = validationSpace(request)
        if (request.method === 'GET') { json(response, 200, db.getSnapshot(space)); return }
        if (request.method !== 'POST') throw new LocalApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.')
        if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          throw new LocalApiError(415, 'INVALID_CONTENT_TYPE', 'Sync requests must contain JSON.')
        }
        const bytes = await body(request, MAX_JSON_BYTES)
        let parsed: unknown
        try { parsed = JSON.parse(bytes.toString('utf8')) } catch { throw new LocalApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.') }
        const result = db.merge(space, validateRequest(parsed))
        json(response, 200, result)
        return
      }
      if (path.startsWith('/api/photos/')) {
        const space = validationSpace(request)
        const id = path.slice('/api/photos/'.length)
        if (!PHOTO_ID.test(id)) throw new LocalApiError(422, 'INVALID_PHOTO_ID', 'The photo identifier is invalid.')
        if (request.method === 'PUT') {
          const mime = request.headers['content-type']?.split(';')[0].trim().toLowerCase() ?? ''
          // SVG is intentionally excluded: a private image must never become executable same-origin markup.
          if (!IMAGE_TYPES.has(mime)) throw new LocalApiError(415, 'INVALID_IMAGE_TYPE', 'Use a supported raster image type.')
          const bytes = await body(request, MAX_PHOTO_BYTES)
          if (!bytes.length) throw new LocalApiError(422, 'EMPTY_PHOTO', 'The photo must not be empty.')
          db.putPhoto(space, id, mime, bytes)
          json(response, 200, { ok: true })
          return
        }
        if (request.method !== 'GET') throw new LocalApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.')
        const photo = db.getPhoto(space, id)
        if (!photo) throw new LocalApiError(404, 'PHOTO_NOT_FOUND', 'The photo is not available in this local validation space.')
        response.writeHead(200, { 'Content-Type': photo.mime, 'Content-Length': photo.bytes.length, 'Content-Security-Policy': "default-src 'none'; sandbox" })
        response.end(photo.bytes)
        return
      }
      if (path === '/api' || path.startsWith('/api/')) throw new LocalApiError(404, 'NOT_FOUND', 'The requested API is not available.')
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new LocalApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.')
      await serveStatic(request, response, path, options.distDir)
    })().catch((error: unknown) => {
      if (response.destroyed || response.headersSent) return
      // A rejected upload may leave an unfinished body on the socket. Do not reuse that
      // connection and accidentally parse the next request as the remainder of this body.
      if (!request.complete) response.setHeader('Connection', 'close')
      if (error instanceof LocalApiError) { json(response, error.status, { error: error.message, code: error.code }); return }
      const code = error instanceof Error && 'code' in error ? error.code : undefined
      if (code === 'INVALID_SNAPSHOT' || code === 'SYNC_CONFLICT') {
        json(response, code === 'SYNC_CONFLICT' ? 409 : 422, {
          error: code === 'SYNC_CONFLICT' ? 'The same record has conflicting evidence. Local data is preserved.' : 'The progress snapshot is invalid.', code,
        })
        return
      }
      // Do not return SQLite errors, private paths, submitted content or stack traces.
      json(response, 500, { error: 'Local storage is temporarily unavailable. Your pending request can be retried.', code: 'LOCAL_STORAGE_ERROR' })
    })
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 15_000
  server.keepAliveTimeout = 5_000
  let closed = false
  return {
    server, db,
    async start(): Promise<{ port: number; url: string }> {
      await new Promise<void>((accept, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => { server.off('error', reject); accept() })
      })
      const actualPort = (server.address() as AddressInfo).port
      return { port: actualPort, url: `http://127.0.0.1:${actualPort}` }
    },
    async close(): Promise<void> {
      if (closed) return
      closed = true
      if (server.listening) {
        await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()))
      }
      db.close()
    },
  }
}

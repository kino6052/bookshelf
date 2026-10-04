// Small helpers shared by the dev/preview middlewares.
import type { IncomingMessage, ServerResponse } from 'node:http'

export type Next = (err?: unknown) => void
export type Middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => void

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(text)
}

export function sendError(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { error })
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** "localhost:5173" → "localhost". Handles bracketed IPv6. */
export function hostnameOfHostHeader(host: string): string {
  const h = host.trim().toLowerCase()
  if (h.startsWith('[')) {
    const end = h.indexOf(']')
    return end > 0 ? h.slice(0, end + 1) : h
  }
  const colon = h.lastIndexOf(':')
  return colon >= 0 ? h.slice(0, colon) : h
}

export function isLocalHostHeader(host: string | undefined): boolean {
  if (!host) return false
  return LOCAL_HOSTNAMES.has(hostnameOfHostHeader(host))
}

export function isLocalOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_HOSTNAMES.has(u.hostname)
  } catch {
    return false
  }
}

/** Host must be local; Origin, when the browser sends one, must be local too. */
export function isLocalRequest(req: IncomingMessage): boolean {
  if (!isLocalHostHeader(req.headers.host)) return false
  const origin = req.headers.origin
  if (origin !== undefined && !isLocalOrigin(origin)) return false
  return true
}

export async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > maxBytes) throw Object.assign(new Error('Body too large'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function readJson(req: IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  const body = await readBody(req, maxBytes)
  try {
    return JSON.parse(body.toString('utf8'))
  } catch {
    throw Object.assign(new Error('Body is not valid JSON'), { status: 400 })
  }
}

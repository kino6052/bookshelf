// Serves /books/* and /music/* from the content folders with HTTP Range support (dev and preview).
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extOf } from '../src/shared/names'
import { sendError, type Middleware } from './http'

const MIME: Record<string, string> = {
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  url: 'text/plain; charset=utf-8',
  webloc: 'application/xml; charset=utf-8',
  json: 'application/json; charset=utf-8',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
}

export function contentType(filename: string): string {
  return MIME[extOf(filename)] ?? 'application/octet-stream'
}

/** Resolves a URL path below `root`, refusing traversal and dotfiles. */
export function resolveInside(root: string, urlPath: string): string | undefined {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return undefined
  }
  if (decoded.includes('\0')) return undefined
  const parts = decoded.split('/').filter(Boolean)
  if (parts.some((p) => p === '..' || p === '.' || p.startsWith('.') || p.includes('\\'))) return undefined
  const full = path.resolve(root, ...parts)
  const rel = path.relative(root, full)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined
  return full
}

export function parseRange(header: string, size: number): { start: number; end: number } | 'invalid' | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid'
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (suffix === 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start > end || start >= size) return 'invalid'
  return { start, end }
}

async function serveFile(req: IncomingMessage, res: ServerResponse, file: string): Promise<void> {
  let st
  try {
    st = await stat(file)
  } catch {
    return sendError(res, 404, 'Not found')
  }
  if (!st.isFile()) return sendError(res, 404, 'Not found')
  res.setHeader('Content-Type', contentType(file))
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Last-Modified', st.mtime.toUTCString())
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const range = req.headers.range
  let start = 0
  let end = st.size - 1
  if (range && st.size > 0) {
    const r = parseRange(range, st.size)
    if (r === 'invalid') {
      res.statusCode = 416
      res.setHeader('Content-Range', `bytes */${st.size}`)
      return void res.end()
    }
    if (r) {
      start = r.start
      end = r.end
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`)
    }
  } else {
    res.statusCode = 200
  }
  res.setHeader('Content-Length', String(st.size === 0 ? 0 : end - start + 1))
  if (req.method === 'HEAD' || st.size === 0) return void res.end()
  const stream = createReadStream(file, { start, end })
  stream.on('error', () => res.destroy())
  req.on('close', () => stream.destroy())
  stream.pipe(res)
}

/** Mounts `root` at `/<prefix>/` (prefix without slashes). */
export function staticDirMiddleware(prefix: string, getRoot: () => string): Middleware {
  const mount = `/${prefix}/`
  return (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith(mount)) return next()
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const pathname = url.slice(mount.length).split('?')[0]!.split('#')[0]!
    const file = resolveInside(getRoot(), pathname)
    if (!file) return sendError(res, 404, 'Not found')
    serveFile(req, res, file).catch((err: unknown) => {
      if (!res.headersSent) sendError(res, 500, String(err))
      else res.destroy()
    })
  }
}

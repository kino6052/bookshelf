// Dev/preview-server-only helper for verification evidence: saves a canvas PNG into docs/verification/.
// Never part of the built site (it lives in the Vite plugin, not in client code).
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isLocalRequest, readBody, sendError, sendJson, type Middleware } from './http.ts'

export function verifySnapshotMiddleware(outDir: string): Middleware {
  return (req, res, next) => {
    if (!req.url?.startsWith('/__verify/snapshot')) return next()
    if (req.method !== 'POST') return sendError(res, 405, 'POST only')
    if (!isLocalRequest(req)) return sendError(res, 403, 'Local requests only')
    const name = new URL(req.url, 'http://x').searchParams.get('name') ?? ''
    if (!/^[a-z0-9][a-z0-9._-]{0,80}$/i.test(name)) return sendError(res, 400, 'Bad name')
    readBody(req, 30 * 1024 * 1024)
      .then(async (body) => {
        const text = body.toString('utf8')
        const m = /^data:image\/png;base64,(.+)$/s.exec(text)
        if (!m) return sendError(res, 400, 'Expected a PNG data URL')
        await mkdir(outDir, { recursive: true })
        const file = path.join(outDir, `${name}.png`)
        await writeFile(file, Buffer.from(m[1]!, 'base64'))
        sendJson(res, 200, { saved: path.relative(process.cwd(), file).split(path.sep).join('/') })
      })
      .catch((err: unknown) => sendError(res, 500, String(err)))
  }
}

// Serves dist/ under /bookshelf/ the way GitHub Pages serves a project site, to check that base: './' works.
// Usage: pnpm run build && node scripts/serve-subpath.mjs   →   http://127.0.0.1:4175/bookshelf/
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const root = path.resolve('dist')
const prefix = '/bookshelf/'
const port = Number(process.env.PORT) || 4175
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.epub': 'application/epub+zip', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' }

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/' || url.pathname === '/bookshelf') {
      res.writeHead(302, { Location: prefix }).end()
      return
    }
    if (!url.pathname.startsWith(prefix)) {
      res.writeHead(404).end('Not under /bookshelf/')
      return
    }
    let rel = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html'
    const file = path.resolve(root, rel)
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403).end()
      return
    }
    try {
      const st = await stat(file)
      if (st.isDirectory()) rel = path.join(rel, 'index.html')
      const target = st.isDirectory() ? path.join(file, 'index.html') : file
      res.writeHead(200, { 'Content-Type': types[path.extname(target).toLowerCase()] ?? 'application/octet-stream' })
      createReadStream(target).pipe(res)
    } catch {
      res.writeHead(404).end('Not found')
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`dist/ served at http://127.0.0.1:${port}${prefix}`))

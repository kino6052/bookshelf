import path from 'node:path'
import { defineConfig } from 'vite'
import { bookshelfPlugin } from './server/plugin.ts'
import { verifySnapshotMiddleware } from './server/verify.ts'

const verifyDir = path.resolve('docs/verification')

export default defineConfig({
  base: './',
  // three.js alone is ~150 KB gzip; the §3.7 budget is 700 KB gzip for first-load JS.
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  // Pre-bundle the lazily imported reader libraries so opening the first book in dev never triggers a reload.
  optimizeDeps: { include: ['three', 'markdown-it', 'dompurify', 'pdfjs-dist', 'epubjs'] },
  plugins: [
    bookshelfPlugin(),
    {
      name: 'bookshelf-verify',
      configureServer(server) {
        server.middlewares.use(verifySnapshotMiddleware(verifyDir))
      },
      configurePreviewServer(server) {
        server.middlewares.use(verifySnapshotMiddleware(verifyDir))
      },
    },
  ],
})

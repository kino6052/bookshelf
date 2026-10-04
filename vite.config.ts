import path from 'node:path'
import { defineConfig } from 'vite'
import { bookshelfPlugin } from './server/plugin'
import { verifySnapshotMiddleware } from './server/verify'

const verifyDir = path.resolve('docs/verification')

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
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

// The bookshelf Vite plugin: manifest + content serving + live updates in dev, manifest + content copy in build.
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { watch } from 'chokidar'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { isIgnoredName, scanLibrary, type ScanDirs } from './scan.ts'
import { staticDirMiddleware } from './static.ts'
import { sendError } from './http.ts'
import type { Library } from '../src/shared/types.ts'

export const LIBRARY_EVENT = 'bookshelf:library'

export function contentDirs(root: string): ScanDirs {
  return {
    booksDir: path.resolve(root, process.env.BOOKSHELF_BOOKS_DIR || 'books'),
    musicDir: path.resolve(root, process.env.BOOKSHELF_MUSIC_DIR || 'music'),
  }
}

/** Keeps the manifest in memory and only logs warnings that are new since the last scan. */
export class LibraryState {
  json = ''
  library: Library = { version: 1, shelves: [], tracks: [] }
  revision = 0
  private seenWarnings = new Set<string>()
  private scanning: Promise<boolean> | undefined
  private rescanQueued = false

  constructor(
    readonly dirs: ScanDirs,
    private readonly log: (m: string) => void,
  ) {}

  /** Rescans; resolves true when the manifest changed. Concurrent calls coalesce into one follow-up scan. */
  rescan(): Promise<boolean> {
    if (this.scanning) {
      this.rescanQueued = true
      return this.scanning
    }
    this.scanning = (async () => {
      let changed = false
      do {
        this.rescanQueued = false
        const { library, warnings } = await scanLibrary(this.dirs)
        const fresh = new Set(warnings)
        for (const w of warnings) if (!this.seenWarnings.has(w)) this.log(`warning: ${w}`)
        this.seenWarnings = fresh
        const json = JSON.stringify(library)
        if (json !== this.json) {
          this.json = json
          this.library = library
          this.revision++
          changed = true
        }
      } while (this.rescanQueued)
      return changed
    })().finally(() => {
      this.scanning = undefined
    })
    return this.scanning
  }

  ready(): Promise<unknown> {
    return this.scanning ?? (this.json ? Promise.resolve() : this.rescan())
  }
}

function countBooks(lib: Library): number {
  return lib.shelves.reduce((n, s) => n + s.books.length, 0)
}

export interface DevHooks {
  /** Lets the authoring plugin react after the state exists (dev only). */
  onState?: (state: LibraryState, server: ViteDevServer) => void
}

export function bookshelfPlugin(hooks: DevHooks = {}): Plugin {
  let config: ResolvedConfig
  let dirs: ScanDirs
  const log = (m: string) => config.logger.info(`[bookshelf] ${m}`, { timestamp: true })

  return {
    name: 'bookshelf',

    config(userConfig) {
      const root = path.resolve(userConfig.root ?? process.cwd())
      const d = contentDirs(root)
      // Content changes are pushed as a custom HMR event; never let Vite full-reload on them.
      const toGlob = (p: string) => p.split(path.sep).join('/') + '/**'
      return { server: { watch: { ignored: [toGlob(d.booksDir), toGlob(d.musicDir)] } } }
    },

    configResolved(c) {
      config = c
      dirs = contentDirs(c.root)
    },

    configureServer(server) {
      const state = new LibraryState(dirs, log)
      void state.rescan().then(() => log(`library: ${state.library.shelves.length} shelves, ${countBooks(state.library)} books, ${state.library.tracks.length} tracks (books: ${dirs.booksDir})`))

      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url !== '/library.json') return next()
        state
          .ready()
          .then(() => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end(state.json)
          })
          .catch((err: unknown) => sendError(res, 500, String(err)))
      })
      server.middlewares.use(staticDirMiddleware('books', () => dirs.booksDir))
      server.middlewares.use(staticDirMiddleware('music', () => dirs.musicDir))

      let timer: NodeJS.Timeout | undefined
      const watcher = watch([dirs.booksDir, dirs.musicDir], {
        ignoreInitial: true,
        depth: 1,
        // Wait until a file's size has been stable for 500 ms, so big manual copies aren't read half-written.
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      })
      watcher.on('all', () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          void state.rescan().then((changed) => {
            if (!changed) return
            log(`library updated (rev ${state.revision}): ${countBooks(state.library)} books`)
            server.ws.send({ type: 'custom', event: LIBRARY_EVENT, data: { revision: state.revision } })
          })
        }, 200)
      })
      server.httpServer?.once('close', () => void watcher.close())
      hooks.onState?.(state, server)
    },

    async generateBundle() {
      if (config.command !== 'build') return
      const { library, warnings } = await scanLibrary(dirs)
      for (const w of warnings) this.warn(w)
      this.emitFile({ type: 'asset', fileName: 'library.json', source: JSON.stringify(library) })
    },

    async writeBundle() {
      if (config.command !== 'build') return
      const outDir = path.resolve(config.root, config.build.outDir)
      const copied = (await copyContent(dirs.booksDir, path.join(outDir, 'books'), 1)) + (await copyContent(dirs.musicDir, path.join(outDir, 'music'), 0))
      log(`copied ${copied} content files into ${path.relative(config.root, outDir) || '.'}`)
    },
  }
}

/** Copies non-ignored files; `depth` is how many folder levels to descend (books: shelves only). */
async function copyContent(from: string, to: string, depth: number): Promise<number> {
  let entries
  try {
    entries = await readdir(from, { withFileTypes: true })
  } catch {
    return 0
  }
  await mkdir(to, { recursive: true })
  let n = 0
  for (const e of entries) {
    if (isIgnoredName(e.name)) continue
    if (e.isDirectory()) {
      if (depth > 0) n += await copyContent(path.join(from, e.name), path.join(to, e.name), depth - 1)
    } else if (e.isFile()) {
      await copyFile(path.join(from, e.name), path.join(to, e.name))
      n++
    }
  }
  return n
}

// scanLibrary(): the only producer of library.json (dev server and build both call it).
import { open, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontMatter } from '../src/shared/frontmatter.ts'
import { displayDomain, parseUrlFile, parseWeblocFile, validateTarget } from '../src/shared/linkfile.ts'
import { encodePath, extOf, humanize, parseBookFilename, shelfNumberFromFolder, shelfTitleFromFolder, stripExt } from '../src/shared/names.ts'
import { compareBooks, compareText } from '../src/shared/sort.ts'
import { BOOK_EXTENSIONS, MUSIC_EXTENSIONS, type Book, type EmbedMode, type Format, type Library, type Shelf, type Track } from '../src/shared/types.ts'

export interface ScanDirs {
  booksDir: string
  musicDir: string
}

export interface ScanResult {
  library: Library
  warnings: string[]
}

const IGNORED_NAMES = new Set(['thumbs.db', 'desktop.ini', 'shelf.json'])
const TEMP_EXTENSIONS = new Set(['part', 'tmp', 'crdownload'])
const SIDECAR_SUFFIX = '.meta.json'
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const EMBED_MODES: readonly EmbedMode[] = ['auto', 'iframe', 'link']

export function isIgnoredName(name: string): boolean {
  if (name.startsWith('.')) return true
  const lower = name.toLowerCase()
  if (IGNORED_NAMES.has(lower)) return true
  return TEMP_EXTENSIONS.has(extOf(name))
}

function formatOf(filename: string): Format | 'webloc' | undefined {
  const ext = extOf(filename)
  if ((BOOK_EXTENSIONS as readonly string[]).includes(ext)) return ext as Format
  if (ext === 'url') return 'url'
  if (ext === 'webloc') return 'webloc'
  return undefined
}

interface Sidecar {
  title?: string
  author?: string
  spineColor?: string
  order?: number
  embed?: EmbedMode
}

function parseSidecar(raw: unknown, warn: (m: string) => void, where: string): Sidecar {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warn(`${where}: sidecar is not a JSON object, ignored`)
    return {}
  }
  const o = raw as Record<string, unknown>
  const out: Sidecar = {}
  if (typeof o.title === 'string' && o.title.trim()) out.title = o.title.trim()
  if (typeof o.author === 'string' && o.author.trim()) out.author = o.author.trim()
  if (typeof o.spineColor === 'string') {
    if (HEX_COLOR.test(o.spineColor)) out.spineColor = o.spineColor.toLowerCase()
    else if (o.spineColor) warn(`${where}: spineColor "${o.spineColor}" is not #rrggbb, ignored`)
  }
  if (typeof o.order === 'number' && Number.isFinite(o.order)) out.order = o.order
  if (typeof o.embed === 'string') {
    if ((EMBED_MODES as readonly string[]).includes(o.embed)) out.embed = o.embed as EmbedMode
    else warn(`${where}: embed "${o.embed}" is not auto|iframe|link, ignored`)
  }
  return out
}

async function readJsonFile(file: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    const text = await readFile(file, 'utf8')
    return { ok: true, value: JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function readHead(file: string, bytes: number): Promise<string> {
  const fh = await open(file, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(buf, 0, bytes, 0)
    return buf.subarray(0, bytesRead).toString('utf8')
  } finally {
    await fh.close()
  }
}

function bookUrl(shelfFolder: string, filename: string, mtime: number): string {
  return `books/${encodePath([shelfFolder, filename])}?v=${mtime}`
}

/**
 * Builds the Book record for one file. Returns undefined (with a warning) when the file is not a book.
 * `sidecarNames` is the set of filenames in the folder, so we only try to read sidecars that exist.
 */
export async function scanBookFile(
  booksDir: string,
  shelfFolder: string,
  filename: string,
  warn: (m: string) => void,
  sidecarNames?: Set<string>,
): Promise<Book | undefined> {
  const kind = formatOf(filename)
  if (!kind) return undefined
  const file = path.join(booksDir, shelfFolder, filename)
  const id = `${shelfFolder}/${filename}`
  let st
  try {
    st = await stat(file)
  } catch (err) {
    warn(`${id}: cannot stat (${(err as Error).message}), skipped`)
    return undefined
  }
  if (!st.isFile()) return undefined
  const mtime = Math.floor(st.mtimeMs)

  let sidecar: Sidecar = {}
  const sidecarName = filename + SIDECAR_SUFFIX
  if (!sidecarNames || sidecarNames.has(sidecarName)) {
    const res = await readJsonFile(path.join(booksDir, shelfFolder, sidecarName))
    if (res.ok) sidecar = parseSidecar(res.value, warn, `${shelfFolder}/${sidecarName}`)
    else if (sidecarNames) warn(`${shelfFolder}/${sidecarName}: bad JSON (${res.error}), ignored`)
  }

  const fromName = parseBookFilename(filename)
  const book: Book = {
    id,
    shelfId: shelfFolder,
    url: bookUrl(shelfFolder, filename, mtime),
    format: kind === 'webloc' ? 'url' : kind,
    title: fromName.title,
    bytes: st.size,
    mtime,
  }

  if (book.format === 'url') {
    let raw: string | undefined
    try {
      const text = await readHead(file, 64 * 1024)
      raw = kind === 'webloc' ? parseWeblocFile(text) : parseUrlFile(text)
    } catch (err) {
      warn(`${id}: cannot read link file (${(err as Error).message}), skipped`)
      return undefined
    }
    const check = validateTarget(raw)
    if (!check.ok) {
      warn(`${id}: link rejected (${check.reason}), skipped`)
      return undefined
    }
    book.target = check.url
    book.embed = sidecar.embed ?? 'auto'
    const author = sidecar.author ?? fromName.author ?? displayDomain(check.hostname)
    book.author = author
    book.title = sidecar.title ?? fromName.title
  } else {
    let fm: Record<string, string> = {}
    if (book.format === 'md' && !(sidecar.title && sidecar.author)) {
      try {
        fm = parseFrontMatter(await readHead(file, 16 * 1024)).data
      } catch {
        // unreadable head: fall back to the filename
      }
    }
    book.title = sidecar.title ?? fm.title ?? fromName.title
    const author = sidecar.author ?? fm.author ?? fromName.author
    if (author) book.author = author
  }
  if (sidecar.spineColor) book.spineColor = sidecar.spineColor
  if (sidecar.order !== undefined) book.order = sidecar.order
  return book
}

interface ShelfMeta {
  title?: string
  order?: number
}

async function readShelfMeta(dir: string, folder: string, warn: (m: string) => void): Promise<ShelfMeta> {
  const res = await readJsonFile(path.join(dir, folder, 'shelf.json'))
  if (!res.ok) {
    if (!/ENOENT/.test(res.error)) warn(`${folder}/shelf.json: bad JSON (${res.error}), ignored`)
    return {}
  }
  const v = res.value
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    warn(`${folder}/shelf.json: not a JSON object, ignored`)
    return {}
  }
  const o = v as Record<string, unknown>
  const out: ShelfMeta = {}
  if (typeof o.title === 'string' && o.title.trim()) out.title = o.title.trim()
  if (typeof o.order === 'number' && Number.isFinite(o.order)) out.order = o.order
  return out
}

async function scanShelf(booksDir: string, folder: string, warn: (m: string) => void, unknownExt: Set<string>) {
  const dir = path.join(booksDir, folder)
  const entries = await readdir(dir, { withFileTypes: true })
  const names = new Set(entries.filter((e) => e.isFile()).map((e) => e.name))
  const books: Book[] = []
  const jobs: Promise<Book | undefined>[] = []
  for (const e of entries) {
    if (isIgnoredName(e.name)) continue
    if (e.isDirectory()) {
      warn(`${folder}/${e.name}/: nested folders are ignored (shelves are one level deep)`)
      continue
    }
    if (!e.isFile()) continue
    const ext = extOf(e.name)
    if (ext === 'json') continue
    if (!formatOf(e.name)) {
      if (!unknownExt.has(ext)) {
        unknownExt.add(ext)
        warn(`ignoring files with unknown extension ".${ext}" (first: ${folder}/${e.name})`)
      }
      continue
    }
    jobs.push(scanBookFile(booksDir, folder, e.name, warn, names))
  }
  for (const b of await Promise.all(jobs)) if (b) books.push(b)
  books.sort(compareBooks)
  return books
}

async function scanTracks(musicDir: string, warn: (m: string) => void): Promise<Track[]> {
  let entries
  try {
    entries = await readdir(musicDir, { withFileTypes: true })
  } catch {
    return []
  }
  const tracks: Track[] = []
  for (const e of entries) {
    if (!e.isFile() || isIgnoredName(e.name)) continue
    const ext = extOf(e.name)
    if (!(MUSIC_EXTENSIONS as readonly string[]).includes(ext)) continue
    let mtime = 0
    try {
      mtime = Math.floor((await stat(path.join(musicDir, e.name))).mtimeMs)
    } catch (err) {
      warn(`music/${e.name}: cannot stat (${(err as Error).message}), skipped`)
      continue
    }
    tracks.push({
      id: e.name,
      url: `music/${encodePath([e.name])}?v=${mtime}`,
      title: humanize(stripExt(e.name).replace(/^\d+[-_ .]+/, '')),
    })
  }
  return tracks.sort((a, b) => compareText(a.id, b.id))
}

export async function scanLibrary(dirs: ScanDirs): Promise<ScanResult> {
  const warnings: string[] = []
  const warn = (m: string) => warnings.push(m)
  const unknownExt = new Set<string>()
  let entries: import('node:fs').Dirent[] = []
  try {
    entries = await readdir(dirs.booksDir, { withFileTypes: true })
  } catch (err) {
    warn(`books folder not readable (${(err as Error).message}); the library is empty`)
  }

  const folders = entries.filter((e) => e.isDirectory() && !isIgnoredName(e.name)).map((e) => e.name)
  const shelves = await Promise.all(
    folders.map(async (folder) => {
      const meta = await readShelfMeta(dirs.booksDir, folder, warn)
      let books: Book[] = []
      try {
        books = await scanShelf(dirs.booksDir, folder, warn, unknownExt)
      } catch (err) {
        warn(`${folder}/: cannot read (${(err as Error).message})`)
      }
      return { folder, meta, books }
    }),
  )

  const keyed = shelves.map((s) => ({ ...s, key: s.meta.order ?? shelfNumberFromFolder(s.folder) }))
  keyed.sort((a, b) => {
    if (a.key !== undefined && b.key !== undefined && a.key !== b.key) return a.key - b.key
    if (a.key !== undefined && b.key === undefined) return -1
    if (a.key === undefined && b.key !== undefined) return 1
    return compareText(a.folder, b.folder)
  })
  const maxKey = Math.max(0, ...keyed.map((s) => s.key ?? 0))
  let next = Math.floor(maxKey) + 1
  const out: Shelf[] = keyed.map((s) => ({
    id: s.folder,
    title: s.meta.title ?? shelfTitleFromFolder(s.folder),
    order: s.key ?? next++,
    books: s.books,
  }))

  return {
    library: { version: 1, shelves: out, tracks: await scanTracks(dirs.musicDir, warn) },
    warnings,
  }
}

/** Highest shelf order in use (shelf.json order or NN- prefix); new shelves go after it. */
export function maxShelfOrder(lib: Library): number {
  return Math.max(0, ...lib.shelves.map((s) => s.order))
}

// The client treats library.json as untrusted: keep what's well-formed, skip the rest with a warning.
import { validateTarget } from './linkfile.ts'
import type { Book, EmbedMode, Format, Library, Shelf, Track } from './types.ts'

const FORMATS: readonly Format[] = ['md', 'txt', 'pdf', 'epub', 'url']
const EMBEDS: readonly EmbedMode[] = ['auto', 'iframe', 'link']
const HEX = /^#[0-9a-f]{6}$/i

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Relative content URL under `prefix/`, no scheme, no traversal. */
function isContentUrl(v: unknown, prefix: string): v is string {
  if (!str(v, 4096)) return false
  if (!v.startsWith(prefix + '/')) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//')) return false
  const path = v.split('?')[0]!
  return !path.split('/').some((seg) => {
    try {
      const d = decodeURIComponent(seg)
      return d === '..' || d === '.'
    } catch {
      return true
    }
  })
}

function validateBook(raw: unknown, shelfId: string, warn: (m: string) => void): Book | undefined {
  if (!isObj(raw)) return warn(`skipped a book in "${shelfId}": not an object`), undefined
  const label = typeof raw.id === 'string' ? raw.id : '(no id)'
  const bad = (why: string) => (warn(`skipped book ${label}: ${why}`), undefined)
  if (!str(raw.id, 1000)) return bad('missing id')
  if (raw.shelfId !== shelfId) return bad('shelfId does not match its shelf')
  if (!isContentUrl(raw.url, 'books')) return bad('url is not a books/ path')
  if (!FORMATS.includes(raw.format as Format)) return bad('unknown format')
  if (!str(raw.title, 1000)) return bad('missing title')
  if (!num(raw.bytes) || raw.bytes < 0) return bad('bad bytes')
  if (!num(raw.mtime)) return bad('bad mtime')
  const book: Book = {
    id: raw.id,
    shelfId,
    url: raw.url,
    format: raw.format as Format,
    title: raw.title,
    bytes: raw.bytes,
    mtime: raw.mtime,
  }
  if (raw.author !== undefined) {
    if (!str(raw.author, 1000)) return bad('bad author')
    book.author = raw.author
  }
  if (raw.spineColor !== undefined && typeof raw.spineColor === 'string' && HEX.test(raw.spineColor)) book.spineColor = raw.spineColor
  if (num(raw.order)) book.order = raw.order
  if (book.format === 'url') {
    const check = validateTarget(typeof raw.target === 'string' ? raw.target : undefined)
    if (!check.ok) return bad(`website target rejected (${check.reason})`)
    book.target = check.url
    book.embed = EMBEDS.includes(raw.embed as EmbedMode) ? (raw.embed as EmbedMode) : 'auto'
  }
  return book
}

export function validateLibrary(raw: unknown): { library: Library; warnings: string[] } {
  const warnings: string[] = []
  const warn = (m: string) => void warnings.push(m)
  const library: Library = { version: 1, shelves: [], tracks: [] }
  if (!isObj(raw)) return warn('library.json is not an object'), { library, warnings }
  if (raw.version !== 1) warn(`unexpected manifest version ${String(raw.version)}; reading it as version 1`)

  const shelfIds = new Set<string>()
  const bookIds = new Set<string>()
  for (const s of Array.isArray(raw.shelves) ? raw.shelves : []) {
    if (!isObj(s) || !str(s.id, 500) || !str(s.title, 500) || !num(s.order) || !Array.isArray(s.books)) {
      warn(`skipped a malformed shelf ${isObj(s) && typeof s.id === 'string' ? s.id : ''}`.trim())
      continue
    }
    if (shelfIds.has(s.id)) {
      warn(`skipped duplicate shelf ${s.id}`)
      continue
    }
    shelfIds.add(s.id)
    const shelf: Shelf = { id: s.id, title: s.title, order: s.order, books: [] }
    for (const b of s.books) {
      const book = validateBook(b, s.id, warn)
      if (!book) continue
      if (bookIds.has(book.id)) {
        warn(`skipped duplicate book ${book.id}`)
        continue
      }
      bookIds.add(book.id)
      shelf.books.push(book)
    }
    library.shelves.push(shelf)
  }
  if (!Array.isArray(raw.shelves)) warn('library.json has no shelves array')

  const trackIds = new Set<string>()
  for (const t of Array.isArray(raw.tracks) ? raw.tracks : []) {
    if (!isObj(t) || !str(t.id, 500) || !isContentUrl(t.url, 'music') || !str(t.title, 500) || trackIds.has(t.id)) {
      warn('skipped a malformed track')
      continue
    }
    trackIds.add(t.id)
    const track: Track = { id: t.id, url: t.url, title: t.title }
    library.tracks.push(track)
  }
  return { library, warnings }
}

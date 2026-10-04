// Filename conventions: shelf folder names, "Author - Title.ext", sanitizing uploads.

const NUMBER_PREFIX = /^(\d+)[-_ .]+/

export function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot <= 0 ? '' : filename.slice(dot + 1).toLowerCase()
}

export function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot <= 0 ? filename : filename.slice(0, dot)
}

export function titleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w.charAt(0).toLocaleUpperCase() + w.slice(1))
}

/** "03-kant_and-after" → "Kant And After" */
export function shelfTitleFromFolder(folder: string): string {
  const base = folder.replace(NUMBER_PREFIX, '')
  const spaced = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return titleCase(spaced || folder)
}

/** Leading "NN-" number of a shelf folder, if any. */
export function shelfNumberFromFolder(folder: string): number | undefined {
  const m = NUMBER_PREFIX.exec(folder)
  return m ? Number(m[1]) : undefined
}

export function humanize(stem: string): string {
  const s = stem.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s || stem
}

/** "Plato - The Republic" → { author: "Plato", title: "The Republic" }. Splits on the first " - ". */
export function parseBookFilename(filename: string): { title: string; author?: string } {
  const stem = stripExt(filename)
  const i = stem.indexOf(' - ')
  if (i > 0) {
    const author = stem.slice(0, i).trim()
    const title = stem.slice(i + 3).trim()
    if (author && title) return { author, title }
  }
  return { title: humanize(stem) }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i

/**
 * Validates an uploaded filename. Returns the cleaned name, or an error string.
 * Rejects (rather than rewrites) anything that looks like a path.
 */
export function sanitizeFilename(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.normalize('NFC').trim()
  if (!name) return { ok: false, error: 'Filename is empty' }
  if (/[\\/]/.test(name)) return { ok: false, error: 'Filename must not contain path separators' }
  if (name === '.' || name === '..' || name.startsWith('.')) return { ok: false, error: 'Filename must not start with a dot' }
  if (/[\u0000-\u001f\u007f]/.test(name)) return { ok: false, error: 'Filename contains control characters' }
  if (/[<>:"|?*]/.test(name)) return { ok: false, error: 'Filename contains characters Windows does not allow (<>:"|?*)' }
  if (/[. ]$/.test(name)) return { ok: false, error: 'Filename must not end with a dot or space' }
  const stem = name.split('.')[0]!
  if (WINDOWS_RESERVED.test(stem.trim())) return { ok: false, error: `"${stem}" is a reserved name on Windows` }
  if (utf8Length(name) > 200) return { ok: false, error: 'Filename is too long' }
  return { ok: true, name }
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length
}

/** "Rationalists & Co." → "rationalists-co" (ASCII-ish slug, never empty). */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'shelf'
}

/** "Book.pdf" → "Book (2).pdf" */
export function withCopySuffix(filename: string, n: number): string {
  // Keep sidecar-style double extensions out of it: only the last extension moves.
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return `${filename} (${n})`
  return `${filename.slice(0, dot)} (${n})${filename.slice(dot)}`
}

/** URL-encodes each path segment (spaces, #, %, &, Unicode) and joins with "/". */
export function encodePath(segments: string[]): string {
  return segments.map((s) => encodeURIComponent(s)).join('/')
}

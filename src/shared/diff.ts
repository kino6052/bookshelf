import type { Book, Library } from './types'

export interface LibraryDiff {
  added: Book[]
  removed: Book[]
  changed: Book[]
  /** Shelf ids, titles or order changed (re-layout needed even if no book changed). */
  shelvesChanged: boolean
  tracksChanged: boolean
  unchanged: boolean
}

const BOOK_FIELDS = ['shelfId', 'url', 'format', 'title', 'author', 'spineColor', 'bytes', 'mtime', 'target', 'embed', 'order'] as const

export function sameBook(a: Book, b: Book): boolean {
  return BOOK_FIELDS.every((k) => a[k] === b[k])
}

export function allBooks(lib: Library): Book[] {
  return lib.shelves.flatMap((s) => s.books)
}

export function diffLibrary(prev: Library, next: Library): LibraryDiff {
  const before = new Map(allBooks(prev).map((b) => [b.id, b]))
  const after = new Map(allBooks(next).map((b) => [b.id, b]))
  const added: Book[] = []
  const removed: Book[] = []
  const changed: Book[] = []
  for (const [id, b] of after) {
    const old = before.get(id)
    if (!old) added.push(b)
    else if (!sameBook(old, b)) changed.push(b)
  }
  for (const [id, b] of before) if (!after.has(id)) removed.push(b)

  const shelfKey = (l: Library) => JSON.stringify(l.shelves.map((s) => [s.id, s.title, s.order, s.books.map((b) => b.id)]))
  const shelvesChanged = shelfKey(prev) !== shelfKey(next)
  const tracksChanged = JSON.stringify(prev.tracks) !== JSON.stringify(next.tracks)
  return {
    added,
    removed,
    changed,
    shelvesChanged,
    tracksChanged,
    unchanged: !added.length && !removed.length && !changed.length && !shelvesChanged && !tracksChanged,
  }
}

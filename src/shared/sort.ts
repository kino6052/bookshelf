import type { Book } from './types.ts'

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** meta.order first, then author (books without an author last), then title, then id. */
export function compareBooks(a: Book, b: Book): number {
  const oa = a.order ?? Number.POSITIVE_INFINITY
  const ob = b.order ?? Number.POSITIVE_INFINITY
  if (oa !== ob) return oa < ob ? -1 : 1
  if (a.author && !b.author) return -1
  if (!a.author && b.author) return 1
  if (a.author && b.author) {
    const c = collator.compare(a.author, b.author)
    if (c) return c
  }
  return collator.compare(a.title, b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

export function compareText(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)
}

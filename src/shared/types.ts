// The manifest contract shared by the scanner (Node) and the client.

export type Format = 'md' | 'txt' | 'html' | 'pdf' | 'epub' | 'url'
export type EmbedMode = 'auto' | 'iframe' | 'link'

export interface Book {
  id: string
  shelfId: string
  url: string
  format: Format
  title: string
  author?: string
  spineColor?: string
  bytes: number
  mtime: number
  /** Website books only. */
  target?: string
  embed?: EmbedMode
  /** Sidecar order; only used for sorting, kept so the client can re-sort after diffs. */
  order?: number
}

export interface Shelf {
  id: string
  title: string
  order: number
  books: Book[]
}

export interface Track {
  id: string
  url: string
  title: string
}

export interface Library {
  version: 1
  shelves: Shelf[]
  tracks: Track[]
}

export const BOOK_EXTENSIONS = ['md', 'txt', 'html', 'pdf', 'epub'] as const
export const LINK_EXTENSIONS = ['url', 'webloc'] as const
export const MUSIC_EXTENSIONS = ['mp3', 'ogg', 'm4a', 'wav'] as const
export const UPLOAD_EXTENSIONS = [...BOOK_EXTENSIONS, ...LINK_EXTENSIONS] as const

import type { Book } from '../shared/types'

export interface TocItem {
  label: string
  target: string
  level: number
}

export interface ViewContext {
  book: Book
  /** The scrolling content area. */
  container: HTMLElement
  /** Extra controls go here (page jump, zoom, website toolbar…). */
  tools: HTMLElement
  signal: AbortSignal
  /** The fetched file (absent for website books, which are never fetched). */
  data?: ArrayBuffer
  savedPosition: string | null
  fontScale: number
  setProgress(fraction: number | undefined, label?: string): void
  setToc(items: TocItem[]): void
  savePosition(pos: string): void
}

export interface FormatView {
  setFontScale?(scale: number): void
  goTo?(target: string): void
  /** Called when the reader becomes visible (layout-dependent work like fit-width). */
  resize?(): void
  destroy(): void
}

export interface FormatModule {
  mount(ctx: ViewContext): Promise<FormatView>
  /** Font size controls make no sense for some formats (pdf, website). */
  fontControls?: boolean
}

export class EmptyBookError extends Error {
  constructor() {
    super('This book is empty.')
  }
}

export function decodeText(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  // UTF-16 BOMs; otherwise UTF-8 (a UTF-8 BOM is dropped by TextDecoder).
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  return new TextDecoder('utf-8').decode(bytes)
}

/** Throttles a scroll handler to one call per animation frame. */
export function onScrollFrame(el: HTMLElement, fn: () => void): () => void {
  let pending = false
  const handler = () => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => {
      pending = false
      fn()
    })
  }
  el.addEventListener('scroll', handler, { passive: true })
  return () => el.removeEventListener('scroll', handler)
}

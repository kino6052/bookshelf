// The reader overlay: one dialog for every format. Format renderers load lazily on first use.
import { displayDomain } from '../shared/linkfile'
import type { Book, Format } from '../shared/types'
import { h, store, trapFocus } from '../ui/dom'
import { EmptyBookError, type FormatModule, type FormatView, type TocItem } from './types'

const LOADERS: Record<Format, () => Promise<FormatModule>> = {
  md: () => import('./md'),
  txt: () => import('./txt'),
  html: () => import('./html'),
  pdf: () => import('./pdf'),
  epub: () => import('./epub'),
  url: () => import('./website'),
}

const FONT_KEY = 'bookshelf:fontScale'
const posKey = (id: string) => `bookshelf:pos:${id}`

async function fetchWithProgress(url: string, signal: AbortSignal, onProgress: (f: number | undefined) => void): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const total = Number(res.headers.get('Content-Length')) || 0
  if (!res.body) return res.arrayBuffer()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
    onProgress(total ? got / total : undefined)
  }
  const out = new Uint8Array(got)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out.buffer
}

export class Reader {
  readonly el: HTMLElement
  private readonly dialog: HTMLElement
  private readonly title: HTMLElement
  private readonly author: HTMLElement
  private readonly content: HTMLElement
  private readonly tools: HTMLElement
  private readonly toc: HTMLElement
  private readonly tocBtn: HTMLButtonElement
  private readonly status: HTMLElement
  private readonly progressFill: HTMLElement
  private readonly progressText: HTMLElement
  private readonly fontBtns: HTMLElement
  private book: Book | undefined
  private view: FormatView | undefined
  private abort: AbortController | undefined
  private releaseFocus?: () => void
  private returnFocus?: Element | null
  private fontScale = Number(store.get(FONT_KEY)) || 1
  private session = 0
  onOpen?: (book: Book) => void
  onClose?: (book: Book) => void

  constructor() {
    this.title = h('h2', { id: 'reader-title', class: 'reader-title' })
    this.author = h('p', { class: 'reader-author' })
    this.tocBtn = h('button', { class: 'btn btn-quiet', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'reader-toc', hidden: true, onclick: () => this.toggleToc() }, '☰ Contents')
    this.tools = h('div', { class: 'reader-format-tools' })
    this.fontBtns = h(
      'div',
      { class: 'reader-font', role: 'group', 'aria-label': 'Font size' },
      h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Smaller text', onclick: () => this.setFont(this.fontScale / 1.12) }, 'A−'),
      h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Larger text', onclick: () => this.setFont(this.fontScale * 1.12) }, 'A+'),
    )
    this.progressText = h('span', { class: 'reader-progress-text', 'aria-live': 'off' })
    this.progressFill = h('div', { class: 'fill' })
    this.toc = h('nav', { id: 'reader-toc', class: 'reader-toc', 'aria-label': 'Contents', hidden: true })
    this.content = h('div', { class: 'reader-content', tabindex: 0 })
    this.status = h('div', { class: 'reader-status', role: 'status', 'aria-live': 'polite' })
    this.dialog = h(
      'section',
      { class: 'reader', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'reader-title' },
      h(
        'header',
        { class: 'reader-bar' },
        this.tocBtn,
        h('div', { class: 'reader-titles' }, this.title, this.author),
        h('div', { class: 'reader-tools' }, this.tools, this.fontBtns, this.progressText, h('button', { class: 'btn btn-icon reader-close', type: 'button', 'aria-label': 'Close book', title: 'Close (Esc)', onclick: () => this.close() }, '×')),
      ),
      h('div', { class: 'reader-progress', 'aria-hidden': 'true' }, this.progressFill),
      h('div', { class: 'reader-main' }, this.toc, this.content, this.status),
    )
    this.el = h('div', { class: 'reader-root', hidden: true }, this.dialog)
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.close()
      }
    })
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close()
    })
  }

  get isOpen(): boolean {
    return !!this.book
  }

  get currentBook(): Book | undefined {
    return this.book
  }

  open(book: Book): void {
    if (this.book) this.teardown()
    this.book = book
    const session = ++this.session
    this.returnFocus = document.activeElement
    this.title.textContent = book.title
    const web = book.format === 'url'
    this.author.textContent = web ? `${book.author && book.author !== displayDomain(book.target!) ? `${book.author} · ` : ''}${displayDomain(book.target!)} ↗` : (book.author ?? '')
    this.dialog.dataset.format = book.format
    this.el.hidden = false
    // Restart the fade-in.
    this.el.classList.remove('visible')
    void this.el.offsetWidth
    this.el.classList.add('visible')
    this.releaseFocus = trapFocus(this.el)
    this.dialog.querySelector<HTMLElement>('.reader-close')?.focus()
    this.onOpen?.(book)
    void this.load(book, session)
  }

  private async load(book: Book, session: number): Promise<void> {
    this.abort = new AbortController()
    const signal = this.abort.signal
    this.resetContent()
    this.setStatus('loading', 'Opening…')
    try {
      const mod = await LOADERS[book.format]()
      if (session !== this.session) return
      this.fontBtns.hidden = mod.fontControls === false
      let data: ArrayBuffer | undefined
      if (book.format !== 'url') {
        data = await fetchWithProgress(book.url, signal, (f) => {
          if (session === this.session) this.setStatus('loading', f === undefined ? 'Opening…' : `Opening… ${Math.round(f * 100)}%`, f)
        })
        if (session !== this.session) return
        if (data.byteLength === 0) throw new EmptyBookError()
      }
      const view = await mod.mount({
        book,
        container: this.content,
        tools: this.tools,
        signal,
        data,
        savedPosition: store.get(posKey(book.id)),
        fontScale: this.fontScale,
        setProgress: (f, label) => session === this.session && this.setProgress(f, label),
        setToc: (items) => session === this.session && this.setToc(items),
        savePosition: (pos) => session === this.session && store.set(posKey(book.id), pos),
      })
      if (session !== this.session) {
        view.destroy()
        return
      }
      this.view = view
      this.setStatus('ready')
    } catch (err) {
      if (session !== this.session || signal.aborted) return
      if (err instanceof EmptyBookError) {
        this.setStatus('empty', 'This book is empty.')
        return
      }
      console.warn(`[reader] ${book.id}:`, err)
      this.setStatus('error', 'Couldn’t open this book.', undefined, () => this.open(book))
    }
  }

  private resetContent(): void {
    this.content.replaceChildren()
    this.content.scrollTop = 0
    this.tools.replaceChildren()
    this.setToc([])
    this.setProgress(undefined)
    this.toc.hidden = true
    this.tocBtn.setAttribute('aria-expanded', 'false')
  }

  private setStatus(state: 'loading' | 'ready' | 'error' | 'empty', text = '', fraction?: number, retry?: () => void): void {
    this.dialog.dataset.state = state
    if (state === 'ready') {
      this.status.replaceChildren()
      this.status.hidden = true
      return
    }
    this.status.hidden = false
    const kids: (Node | string)[] = [h('p', { class: state === 'error' ? 'error-text' : '' }, text)]
    if (state === 'loading') kids.push(h('div', { class: 'progress small' }, h('div', { class: 'progress-fill', style: `width:${Math.round((fraction ?? 0.08) * 100)}%` })))
    if (retry) kids.push(h('button', { class: 'btn', type: 'button', onclick: retry }, 'Retry'))
    this.status.replaceChildren(...kids)
  }

  private setProgress(fraction: number | undefined, label?: string): void {
    this.progressFill.style.width = fraction === undefined ? '0%' : `${Math.round(fraction * 1000) / 10}%`
    this.progressText.textContent = label ?? (fraction === undefined ? '' : `${Math.round(fraction * 100)}%`)
  }

  private setToc(items: TocItem[]): void {
    this.tocBtn.hidden = items.length === 0
    const list = h('ol', {})
    for (const item of items.slice(0, 2000)) {
      list.append(
        h('li', { class: `lvl-${Math.min(item.level, 4)}` }, h('button', {
          type: 'button',
          class: 'toc-link',
          onclick: () => {
            this.view?.goTo?.(item.target)
            if (matchMedia('(max-width: 900px)').matches) this.toggleToc(false)
          },
        }, item.label)),
      )
    }
    this.toc.replaceChildren(list)
  }

  private toggleToc(force?: boolean): void {
    const show = force ?? this.toc.hidden
    this.toc.hidden = !show
    this.tocBtn.setAttribute('aria-expanded', String(show))
  }

  private setFont(scale: number): void {
    this.fontScale = Math.min(2.2, Math.max(0.7, Math.round(scale * 100) / 100))
    store.set(FONT_KEY, String(this.fontScale))
    this.view?.setFontScale?.(this.fontScale)
  }

  /** Closes and aborts any in-flight fetch. Safe to call at any time. */
  close(): void {
    const book = this.book
    if (!book) return
    this.teardown()
    this.el.classList.remove('visible')
    this.el.hidden = true
    this.releaseFocus?.()
    if (this.returnFocus instanceof HTMLElement && document.contains(this.returnFocus)) this.returnFocus.focus()
    this.onClose?.(book)
  }

  private teardown(): void {
    this.session++
    this.abort?.abort()
    this.abort = undefined
    try {
      this.view?.destroy()
    } catch (err) {
      console.warn('[reader] destroy failed', err)
    }
    this.view = undefined
    this.book = undefined
    this.resetContent()
  }
}

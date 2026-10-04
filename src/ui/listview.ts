// List view: every shelf and book, with a filter. Opens books in the reader and "Locate"s them in 3D.
// It is also the fallback when WebGL2 isn't available.
import { displayDomain } from '../shared/linkfile'
import type { Book, Library } from '../shared/types'
import { formatBytes, h } from './dom'
import { Modal } from './modal'

export class ListView {
  readonly modal = new Modal('All books', { wide: true, className: 'list-modal' })
  private readonly filter: HTMLInputElement
  private readonly list: HTMLElement
  private readonly notice: HTMLElement
  private readonly count: HTMLElement
  private library: Library = { version: 1, shelves: [], tracks: [] }

  constructor(private readonly handlers: { onOpen: (book: Book) => void; onLocate?: (book: Book) => void }) {
    this.filter = h('input', { class: 'input', type: 'search', placeholder: 'Filter by title, author or shelf', 'aria-label': 'Filter books' })
    this.filter.addEventListener('input', () => this.render())
    this.list = h('div', { class: 'book-list' })
    this.notice = h('p', { class: 'notice', hidden: true, role: 'note' })
    this.count = h('p', { class: 'muted small', 'aria-live': 'polite' })
    this.modal.body.append(this.notice, this.filter, this.count, this.list)
  }

  setLibrary(lib: Library): void {
    this.library = lib
    if (this.modal.open) this.render()
  }

  setNotice(text: string | undefined): void {
    this.notice.hidden = !text
    this.notice.textContent = text ?? ''
  }

  setLocate(fn: ((book: Book) => void) | undefined): void {
    this.handlers.onLocate = fn
  }

  show(): void {
    this.render()
    this.modal.show(this.filter)
  }

  close(): void {
    this.modal.close()
  }

  private render(): void {
    const q = this.filter.value.trim().toLocaleLowerCase()
    const match = (b: Book, shelfTitle: string) =>
      !q || [b.title, b.author ?? '', shelfTitle, b.target ? displayDomain(b.target) : ''].some((s) => s.toLocaleLowerCase().includes(q))
    let shown = 0
    const sections = this.library.shelves.map((shelf) => {
      const books = shelf.books.filter((b) => match(b, shelf.title))
      if (q && !books.length) return null
      shown += books.length
      return h(
        'section',
        { class: 'shelf-group', 'aria-label': shelf.title },
        h('h3', {}, shelf.title, h('span', { class: 'muted small' }, ` · ${shelf.books.length} ${shelf.books.length === 1 ? 'book' : 'books'}`)),
        books.length
          ? h('ul', { class: 'books' }, ...books.map((b) => this.row(b)))
          : h('p', { class: 'muted small' }, 'This shelf is empty.'),
      )
    })
    const total = this.library.shelves.reduce((n, s) => n + s.books.length, 0)
    this.count.textContent = q ? `${shown} of ${total} books` : `${total} books on ${this.library.shelves.length} shelves`
    this.list.replaceChildren(...sections.filter((s): s is HTMLElement => !!s))
    if (!total) this.list.append(h('p', { class: 'muted' }, 'No books yet.'))
  }

  private row(b: Book): HTMLElement {
    const web = b.format === 'url'
    const meta = web ? `${displayDomain(b.target!)} ↗` : [b.author, b.format.toUpperCase(), formatBytes(b.bytes)].filter(Boolean).join(' · ')
    return h(
      'li',
      { class: `book-row${web ? ' is-web' : ''}` },
      h('span', { class: 'swatch', style: `background:${b.spineColor ?? (web ? '#cfe2ee' : '#8a8478')}`, 'aria-hidden': 'true' }),
      h('span', { class: 'book-text' }, h('span', { class: 'book-title' }, b.title), h('span', { class: 'muted small' }, web && b.author && b.author !== displayDomain(b.target!) ? `${b.author} · ${meta}` : meta)),
      h('button', { class: 'btn btn-small', type: 'button', 'aria-label': `${web ? 'Visit' : 'Open'} ${b.title}`, onclick: () => this.handlers.onOpen(b) }, web ? 'Visit ↗' : 'Open'),
      this.handlers.onLocate ? h('button', { class: 'btn btn-small btn-quiet', type: 'button', 'aria-label': `Locate ${b.title} in the room`, onclick: () => this.handlers.onLocate?.(b) }, 'Locate') : null,
    )
  }
}

// The "Enter" overlay shown at start: title, controls, loading progress and load errors.
import { config } from '../config'
import { h } from './dom'

export class EnterOverlay {
  readonly el: HTMLElement
  private readonly status: HTMLElement
  private readonly bar: HTMLElement
  private readonly enterBtn: HTMLButtonElement
  private readonly errorBox: HTMLElement

  constructor(opts: { touch: boolean; onEnter: (pointerType: string) => void; onList: () => void }) {
    this.enterBtn = h('button', { class: 'btn btn-primary btn-large', type: 'button', disabled: true, onclick: (e: Event) => opts.onEnter((e as PointerEvent).pointerType || 'mouse') }, 'Enter')
    this.status = h('p', { class: 'overlay-status', role: 'status', 'aria-live': 'polite' }, 'Loading the library…')
    this.bar = h('div', { class: 'progress-fill' })
    this.errorBox = h('div', { class: 'overlay-error', hidden: true })
    const controls = opts.touch
      ? h('ul', { class: 'overlay-controls' }, h('li', {}, 'Left thumb: walk'), h('li', {}, 'Right thumb: look around'), h('li', {}, 'Tap a book to open it'))
      : h(
          'ul',
          { class: 'overlay-controls' },
          h('li', {}, 'Move the mouse to look around'),
          h('li', {}, h('kbd', {}, 'W A S D'), ' walk, ', h('kbd', {}, 'Q E'), ' turn, ', h('kbd', {}, 'Shift'), ' faster'),
          h('li', {}, 'Click, ', h('kbd', {}, 'F'), ' or ', h('kbd', {}, 'Enter'), ': open the book in front of you'),
          h('li', {}, h('kbd', {}, 'Esc'), ': menu & free cursor · ', h('kbd', {}, 'M'), ': music'),
        )
    this.el = h(
      'div',
      { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'overlay-title' },
      h(
        'div',
        { class: 'overlay-card' },
        h('h1', { id: 'overlay-title', class: 'overlay-title' }, config.siteTitle),
        h('p', { class: 'overlay-sub' }, 'A small, sunlit room with every book on its shelf.'),
        h('div', { class: 'progress', 'aria-hidden': 'true' }, this.bar),
        this.status,
        this.errorBox,
        h('div', { class: 'overlay-actions' }, this.enterBtn, h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => opts.onList() }, 'Browse as a list')),
        controls,
      ),
    )
  }

  progress(fraction: number, text?: string): void {
    this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`
    if (text) this.status.textContent = text
  }

  ready(summary: string): void {
    this.progress(1, summary)
    this.enterBtn.disabled = false
    this.enterBtn.focus()
  }

  error(message: string, retry?: () => void): void {
    this.errorBox.hidden = false
    this.errorBox.replaceChildren(h('p', {}, message), retry ? h('button', { class: 'btn', type: 'button', onclick: retry }, 'Retry') : '')
    this.status.textContent = 'Something went wrong.'
  }

  show(): void {
    this.el.hidden = false
  }

  hide(): void {
    this.el.hidden = true
  }

  get visible(): boolean {
    return !this.el.hidden
  }
}

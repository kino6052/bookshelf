// Shared modal shell: role=dialog, focus trap, Esc closes, focus returns where it was.
import { h, trapFocus } from './dom'

export class Modal {
  readonly el: HTMLElement
  readonly body: HTMLElement
  private release?: () => void
  private returnFocus?: Element | null
  onClose?: () => void

  constructor(title: string, opts: { className?: string; wide?: boolean } = {}) {
    const id = `modal-${Math.random().toString(36).slice(2, 8)}`
    this.body = h('div', { class: 'modal-body' })
    this.el = h(
      'div',
      { class: `modal-backdrop ${opts.className ?? ''}`, hidden: true },
      h(
        'section',
        { class: `modal ${opts.wide ? 'modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
        h('header', { class: 'modal-head' }, h('h2', { id }, title), h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Close', onclick: () => this.close() }, '×')),
        this.body,
      ),
    )
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close()
    })
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        this.close()
      }
    })
  }

  get open(): boolean {
    return !this.el.hidden
  }

  show(focus?: HTMLElement): void {
    if (this.open) return
    this.returnFocus = document.activeElement
    this.el.hidden = false
    this.release = trapFocus(this.el)
    ;(focus ?? this.el.querySelector<HTMLElement>('input, button'))?.focus()
  }

  close(): void {
    if (!this.open) return
    this.el.hidden = true
    this.release?.()
    if (this.returnFocus instanceof HTMLElement && document.contains(this.returnFocus)) this.returnFocus.focus()
    this.onClose?.()
  }
}

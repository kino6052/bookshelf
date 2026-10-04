// EPUB: epub.js (lazy chunk) from an ArrayBuffer, paginated, TOC, prev/next, font size. Scripts stay disabled.
import ePub from 'epubjs'
import type { NavItem } from 'epubjs'
import { h } from '../ui/dom'
import type { FormatModule, FormatView, TocItem } from './types'

export const fontControls = true

export async function mount(ctx: Parameters<FormatModule['mount']>[0]): Promise<FormatView> {
  const book = ePub(ctx.data!)
  const host = h('div', { class: 'epub-host' })
  ctx.container.append(host)
  const rendition = book.renderTo(host, { width: '100%', height: '100%', flow: 'paginated', spread: 'none', allowScriptedContent: false })
  rendition.themes.default({
    body: { 'font-family': 'Georgia, "Times New Roman", serif !important', 'line-height': '1.6', color: '#2b2a27', padding: '0 4px' },
    'p, li': { 'font-family': 'inherit' },
    a: { color: '#2f6f8f' },
  })
  rendition.themes.fontSize(`${Math.round(ctx.fontScale * 100)}%`)

  await book.ready
  if (ctx.signal.aborted) throw new DOMException('aborted', 'AbortError')
  try {
    await rendition.display(ctx.savedPosition || undefined)
  } catch {
    await rendition.display()
  }

  const nav = await book.loaded.navigation
  const items: TocItem[] = []
  const walk = (list: NavItem[], level: number) => {
    for (const it of list) {
      items.push({ label: it.label.trim(), target: it.href, level })
      if (it.subitems?.length && level < 3) walk(it.subitems, level + 1)
    }
  }
  walk(nav.toc, 1)
  ctx.setToc(items)

  let locationsReady = false
  rendition.on('relocated', (loc: { start: { cfi: string; displayed: { page: number; total: number } } }) => {
    ctx.savePosition(loc.start.cfi)
    if (locationsReady) {
      const f = book.locations.percentageFromCfi(loc.start.cfi)
      ctx.setProgress(f, `${Math.round(f * 100)}%`)
    } else {
      ctx.setProgress(undefined, `p. ${loc.start.displayed.page} / ${loc.start.displayed.total}`)
    }
  })
  // Whole-book progress needs a location index; build it in the background.
  void book.locations.generate(1600).then(() => {
    locationsReady = true
    const cfi = (rendition.currentLocation() as unknown as { start?: { cfi: string } })?.start?.cfi
    if (cfi) {
      const f = book.locations.percentageFromCfi(cfi)
      ctx.setProgress(f, `${Math.round(f * 100)}%`)
    }
  }).catch(() => undefined)

  const prev = () => void rendition.prev()
  const next = () => void rendition.next()
  ctx.tools.append(
    h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Previous page', onclick: prev }, '‹'),
    h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Next page', onclick: next }, '›'),
  )
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev()
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') next()
    else return
    e.preventDefault()
  }
  ctx.container.addEventListener('keydown', onKey)
  rendition.on('keyup', onKey)
  const ro = new ResizeObserver(() => {
    try {
      rendition.resize(host.clientWidth, host.clientHeight)
    } catch {
      // not displayed yet
    }
  })
  ro.observe(host)

  return {
    setFontScale: (s) => rendition.themes.fontSize(`${Math.round(s * 100)}%`),
    goTo: (href) => void rendition.display(href),
    destroy: () => {
      ro.disconnect()
      ctx.container.removeEventListener('keydown', onKey)
      try {
        rendition.destroy()
        book.destroy()
      } catch {
        // already torn down
      }
    },
  }
}

// PDF: pdf.js (lazy chunk), virtualized page canvases, fit-width + zoom, page jump, outline as TOC.
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
// The worker ships as its own file; ?url makes Vite emit it with a hashed name in dev and build alike.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { h } from '../ui/dom'
import { onScrollFrame, type FormatModule, type FormatView, type TocItem } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const fontControls = false

interface PageSlot {
  el: HTMLElement
  canvas?: HTMLCanvasElement
  task?: RenderTask
  renderedScale?: number
  w: number
  h: number
}

export async function mount(ctx: Parameters<FormatModule['mount']>[0]): Promise<FormatView> {
  const task = pdfjs.getDocument({ data: new Uint8Array(ctx.data!) })
  ctx.signal.addEventListener('abort', () => void task.destroy())
  const doc: PDFDocumentProxy = await task.promise
  const first = await doc.getPage(1)
  const base = first.getViewport({ scale: 1 })
  const n = doc.numPages

  const c = ctx.container
  const pagesEl = h('div', { class: 'pdf-pages' })
  c.append(pagesEl)
  let zoom = 1
  const fitScale = () => Math.max(0.2, (c.clientWidth - 32) / base.width)
  const scale = () => fitScale() * zoom
  const slots: PageSlot[] = []
  for (let i = 0; i < n; i++) {
    const el = h('div', { class: 'pdf-page', 'data-page': i + 1, 'aria-label': `Page ${i + 1}` })
    pagesEl.append(el)
    slots.push({ el, w: base.width, h: base.height })
  }
  const sizeSlots = () => {
    const s = scale()
    for (const slot of slots) {
      slot.el.style.width = `${Math.floor(slot.w * s)}px`
      slot.el.style.height = `${Math.floor(slot.h * s)}px`
    }
  }
  sizeSlots()

  const render = async (i: number) => {
    const slot = slots[i]!
    const s = scale()
    if (slot.renderedScale === s || slot.task) return
    const page = await doc.getPage(i + 1)
    const vp = page.getViewport({ scale: s })
    slot.w = vp.width / s
    slot.h = vp.height / s
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = slot.canvas ?? document.createElement('canvas')
    canvas.width = Math.floor(vp.width * dpr)
    canvas.height = Math.floor(vp.height * dpr)
    canvas.style.width = `${Math.floor(vp.width)}px`
    canvas.style.height = `${Math.floor(vp.height)}px`
    slot.el.style.width = canvas.style.width
    slot.el.style.height = canvas.style.height
    if (!slot.canvas) slot.el.append(canvas)
    slot.canvas = canvas
    slot.task = page.render({ canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
    try {
      await slot.task.promise
      slot.renderedScale = s
    } catch {
      // cancelled (scrolled away or zoomed): fine
    } finally {
      slot.task = undefined
    }
  }
  const release = (i: number) => {
    const slot = slots[i]!
    slot.task?.cancel()
    if (slot.canvas) {
      slot.canvas.width = slot.canvas.height = 0
      slot.canvas.remove()
      slot.canvas = undefined
      slot.renderedScale = undefined
    }
  }

  // Render what's on screen (± a page), free canvases far away.
  const visible = new Set<number>()
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const i = Number((e.target as HTMLElement).dataset.page) - 1
        if (e.isIntersecting) {
          visible.add(i)
          void render(i)
        } else {
          visible.delete(i)
          release(i)
        }
      }
    },
    { root: c, rootMargin: '150% 0px' },
  )
  slots.forEach((s) => io.observe(s.el))

  const currentPage = () => {
    const top = c.getBoundingClientRect().top + c.clientHeight * 0.3
    for (let i = 0; i < n; i++) if (slots[i]!.el.getBoundingClientRect().bottom > top) return i + 1
    return n
  }
  const pageInput = h('input', { class: 'input page-input', type: 'number', min: 1, max: n, value: 1, 'aria-label': 'Page number' })
  // The page the reader is on, tracked from scrolling so resizes and zooms keep it.
  let lastPage = 1
  const goToPage = (p: number) => {
    lastPage = Math.min(n, Math.max(1, Math.round(p)))
    const target = slots[lastPage - 1]!
    c.scrollTop += target.el.getBoundingClientRect().top - c.getBoundingClientRect().top - 12
  }
  pageInput.addEventListener('change', () => goToPage(Number(pageInput.value)))
  let lastWidth = c.clientWidth
  const rezoom = (z: number) => {
    const p = lastPage
    zoom = Math.min(4, Math.max(0.4, z))
    sizeSlots()
    for (const i of visible) {
      slots[i]!.renderedScale = undefined
      void render(i)
    }
    goToPage(p)
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`
  }
  const zoomLabel = h('span', { class: 'muted small zoom-label' }, '100%')
  ctx.tools.append(
    h('label', { class: 'page-jump' }, 'Page ', pageInput, ` / ${n}`),
    h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Zoom out', onclick: () => rezoom(zoom / 1.2) }, '−'),
    zoomLabel,
    h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Zoom in', onclick: () => rezoom(zoom * 1.2) }, '+'),
    h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => rezoom(1) }, 'Fit width'),
  )

  const offScroll = onScrollFrame(c, () => {
    if (c.clientWidth < 50) return
    const p = currentPage()
    lastPage = p
    if (document.activeElement !== pageInput) pageInput.value = String(p)
    ctx.setProgress(n > 1 ? (p - 1) / (n - 1) : 1, `p. ${p} / ${n}`)
    ctx.savePosition(String(p))
  })
  const ro = new ResizeObserver(() => {
    // Ignore collapsed layouts (hidden tab/pane) and height-only changes.
    if (c.clientWidth < 50 || Math.abs(c.clientWidth - lastWidth) < 2) return
    lastWidth = c.clientWidth
    rezoom(zoom)
  })
  ro.observe(c)

  // Outline → TOC (best effort).
  void (async () => {
    try {
      const outline = await doc.getOutline()
      if (!outline?.length) return
      const items: TocItem[] = []
      const walk = async (nodes: typeof outline, level: number) => {
        for (const node of nodes) {
          let dest = node.dest
          if (typeof dest === 'string') dest = await doc.getDestination(dest)
          const ref = Array.isArray(dest) ? dest[0] : undefined
          if (ref && typeof ref === 'object') items.push({ label: node.title, target: String((await doc.getPageIndex(ref)) + 1), level })
          if (node.items?.length && level < 3) await walk(node.items, level + 1)
        }
      }
      await walk(outline, 1)
      ctx.setToc(items)
    } catch {
      // no usable outline
    }
  })()

  const saved = Number(ctx.savedPosition)
  ctx.setProgress(0, `p. 1 / ${n}`)
  if (saved > 1) requestAnimationFrame(() => goToPage(saved))

  return {
    goTo: (t) => goToPage(Number(t)),
    destroy: () => {
      io.disconnect()
      ro.disconnect()
      offScroll()
      slots.forEach((_, i) => release(i))
      void task.destroy()
    },
  }
}

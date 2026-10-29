// HTML books: the file's <body>, sanitized, in the scrolled column (its head, styles and scripts are dropped).
// <details> blocks fold to their <summary>, which is how an annotated book folds each paragraph to its gist;
// "Expand all" opens or folds every one. TOC from headings.
import { h } from '../ui/dom'
import { sanitize } from './sanitize'
import { scrollText } from './scrolltext'
import { decodeText, EmptyBookError, type FormatModule, type FormatView, type TocItem } from './types'

const BLOCKS = 'h1, h2, h3, h4, h5, h6, p, details, aside, blockquote, pre, ul, ol, dl, table, figure, hr'

/** Blocks not nested in another block, in document order: the units of position memory. */
function outerBlocks(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(BLOCKS)].filter((el) => {
    const outer = el.parentElement?.closest(BLOCKS)
    return !outer || !root.contains(outer)
  })
}

export const fontControls = true

export async function mount(ctx: Parameters<FormatModule['mount']>[0]): Promise<FormatView> {
  const doc = new DOMParser().parseFromString(decodeText(ctx.data!), 'text/html')
  if (!doc.body.textContent?.trim()) throw new EmptyBookError()
  let blocks = 0
  const st = scrollText(ctx, 'html', () => blocks)
  st.article.innerHTML = sanitize(doc.body.innerHTML)

  // The book's own ids get a prefix so they can't collide with the app's.
  const idOf = (bookId: string) => `b-${bookId}`
  st.article.querySelectorAll<HTMLElement>('[id]').forEach((el) => (el.id = idOf(el.id)))
  const all = outerBlocks(st.article)
  all.forEach((el, i) => (el.dataset.i = String(i)))
  blocks = all.length

  const toc: TocItem[] = []
  all.filter((el) => /^H[1-4]$/.test(el.tagName)).forEach((hd, i) => {
    if (!hd.id) hd.id = idOf(`h-${i}`)
    toc.push({ label: hd.textContent?.trim() || `Section ${i + 1}`, target: hd.id, level: Number(hd.tagName[1]) })
  })
  // Relative images live next to the book file.
  const base = new URL(ctx.book.url, location.href)
  st.article.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
    try {
      img.src = new URL(img.getAttribute('src')!, base).href
    } catch {
      img.remove()
    }
    img.loading = 'lazy'
  })

  const folds = [...st.article.querySelectorAll('details')]
  let foldAll: HTMLButtonElement | undefined
  const syncFoldAll = () => {
    if (foldAll) foldAll.textContent = folds.some((d) => !d.open) ? 'Expand all' : 'Collapse all'
  }
  if (folds.length) {
    foldAll = h('button', {
      class: 'btn btn-small btn-quiet',
      type: 'button',
      onclick: () => {
        const keep = st.firstVisible()
        const open = folds.some((d) => !d.open)
        for (const d of folds) d.open = open
        st.scrollToBlock(keep)
        syncFoldAll()
      },
    })
    ctx.tools.append(foldAll)
    syncFoldAll()
    // toggle doesn't bubble.
    st.article.addEventListener('toggle', syncFoldAll, true)
  }

  const goTo = (id: string) => {
    const el = st.article.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)
    // A target inside folded paragraphs unfolds them first.
    let d = el?.parentElement?.closest('details')
    while (d) {
      d.open = true
      d = d.parentElement?.closest('details')
    }
    el?.scrollIntoView({ block: 'start' })
  }
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href')
    if (href?.startsWith('#')) {
      e.preventDefault()
      goTo(idOf(decodeURIComponent(href.slice(1))))
    }
  }
  st.article.addEventListener('click', onClick)
  ctx.setToc(toc.length > 1 ? toc : [])

  const saved = Number(ctx.savedPosition)
  if (saved > 0) requestAnimationFrame(() => st.scrollToBlock(saved))
  ctx.setProgress(0)

  return {
    setFontScale: (s) => st.setFontScale(s),
    goTo,
    destroy: () => {
      st.article.removeEventListener('click', onClick)
      st.article.removeEventListener('toggle', syncFoldAll, true)
      st.destroy()
    },
  }
}

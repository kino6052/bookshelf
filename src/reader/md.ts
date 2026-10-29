// Markdown: markdown-it → DOMPurify → scrolled column. Front-matter stripped; TOC from headings.
import MarkdownIt from 'markdown-it'
import { parseFrontMatter } from '../shared/frontmatter'
import { sanitize } from './sanitize'
import { scrollText } from './scrolltext'
import { decodeText, EmptyBookError, type FormatModule, type FormatView, type TocItem } from './types'

const md = new MarkdownIt({ html: true, linkify: true, typographer: true })

/** Renders markdown to sanitized HTML. Exported for tests. */
export function renderMarkdown(text: string): string {
  const { body } = parseFrontMatter(text)
  return sanitize(md.render(body))
}

export const fontControls = true

export async function mount(ctx: Parameters<FormatModule['mount']>[0]): Promise<FormatView> {
  const text = decodeText(ctx.data!)
  if (!text.trim()) throw new EmptyBookError()
  const html = renderMarkdown(text)
  let blocks = 0
  const st = scrollText(ctx, 'md', () => blocks)
  st.article.innerHTML = html

  // Number top-level blocks for position memory; give headings ids for the TOC.
  const toc: TocItem[] = []
  const base = new URL(ctx.book.url, location.href)
  ;[...st.article.children].forEach((el, i) => {
    ;(el as HTMLElement).dataset.i = String(i)
    blocks = i + 1
  })
  st.article.querySelectorAll<HTMLElement>('h1, h2, h3, h4').forEach((hd, i) => {
    hd.id = `h-${i}`
    toc.push({ label: hd.textContent?.trim() || `Section ${i + 1}`, target: hd.id, level: Number(hd.tagName[1]) })
  })
  // Relative images live next to the book file.
  st.article.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
    try {
      img.src = new URL(img.getAttribute('src')!, base).href
    } catch {
      img.remove()
    }
    img.loading = 'lazy'
  })
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href')
    if (href?.startsWith('#')) {
      e.preventDefault()
      const target = st.article.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)
      target?.scrollIntoView({ block: 'start' })
    }
  }
  st.article.addEventListener('click', onClick)
  ctx.setToc(toc.length > 1 ? toc : [])

  const saved = Number(ctx.savedPosition)
  if (saved > 0) requestAnimationFrame(() => st.scrollToBlock(saved))
  ctx.setProgress(0)

  return {
    setFontScale: (s) => st.setFontScale(s),
    goTo: (id) => {
      const el = st.article.querySelector(`[id="${CSS.escape(id)}"]`)
      el?.scrollIntoView({ block: 'start' })
    },
    destroy: () => {
      st.article.removeEventListener('click', onClick)
      st.destroy()
    },
  }
}

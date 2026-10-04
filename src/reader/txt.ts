// Plain text: paragraphs split on blank lines, rendered in time-sliced chunks so multi-MB files
// (Gutenberg novels) never block the main thread for long.
import { scrollText } from './scrolltext'
import { decodeText, EmptyBookError, type FormatModule, type FormatView, type TocItem } from './types'

const SLICE_MS = 8
const CHUNK = 150

/** Short ALL-CAPS lines ("CHAPTER IV", "BOOK ONE: 1805") become TOC entries. */
const HEADING = /^(?=.*[A-Z])[^a-z]{2,70}$/
const CHAPTERISH = /^(chapter|book|part|section|canto|letter|volume|preface|introduction|epilogue|prologue|appendix)\b/i

export function looksLikeHeading(p: string): boolean {
  const t = p.trim()
  if (t.includes('\n') || t.length > 70 || t.startsWith('*')) return false
  return (HEADING.test(t) && /[A-Z]{2}/.test(t)) || (CHAPTERISH.test(t) && t.length < 50 && !/[.,;:]\s\w/.test(t))
}

/** Joins hard-wrapped prose lines; keeps line breaks for verse-like blocks (several short lines). */
export function paragraphText(p: string): { text: string; verse: boolean } {
  const lines = p.split(/\r?\n/)
  const verse = lines.length >= 2 && lines.every((l) => l.trim().length < 48)
  return { text: verse ? lines.map((l) => l.trimEnd()).join('\n') : lines.map((l) => l.trim()).join(' '), verse }
}

export const fontControls = true

export async function mount(ctx: Parameters<FormatModule['mount']>[0]): Promise<FormatView> {
  const text = decodeText(ctx.data!)
  if (!text.trim()) throw new EmptyBookError()
  const sep = /\r?\n[ \t]*\r?\n/g
  let blocks = 0
  let done = false
  const st = scrollText(ctx, 'txt', () => (done ? blocks : Math.max(blocks, Math.round(text.length / 450))))
  const toc: TocItem[] = []
  const saved = Number(ctx.savedPosition) || 0
  let restored = saved === 0
  let cursor = 0
  let cancelled = false

  const nextParagraph = (): string | undefined => {
    while (cursor < text.length) {
      sep.lastIndex = cursor
      const m = sep.exec(text)
      const end = m ? m.index : text.length
      const p = text.slice(cursor, end)
      cursor = m ? m.index + m[0].length : text.length
      if (p.trim()) return p
    }
    return undefined
  }

  // Each chunk is its own section with content-visibility, so off-screen layout stays cheap.
  const step = () => {
    if (cancelled) return
    const t0 = performance.now()
    while (performance.now() - t0 < SLICE_MS) {
      const section = document.createElement('section')
      section.className = 'chunk'
      let n = 0
      for (; n < CHUNK; n++) {
        const p = nextParagraph()
        if (p === undefined) break
        const heading = looksLikeHeading(p)
        const el = document.createElement(heading ? 'h3' : 'p')
        const { text: body, verse } = paragraphText(p)
        el.textContent = heading ? p.trim() : body
        if (verse && !heading) el.className = 'verse'
        el.dataset.i = String(blocks)
        if (heading) {
          el.id = `t-${blocks}`
          toc.push({ label: p.trim(), target: el.id, level: 2 })
        }
        section.append(el)
        blocks++
      }
      if (n) st.article.append(section)
      if (n < CHUNK) {
        done = true
        break
      }
    }
    if (!restored && blocks > saved) {
      restored = true
      st.scrollToBlock(saved)
    }
    if (done) {
      ctx.setToc(toc.length > 1 ? toc : [])
      ctx.setProgress(saved ? undefined : 0)
      return
    }
    // Yield to the browser between slices.
    setTimeout(step, 0)
  }
  step()

  return {
    setFontScale: (s) => st.setFontScale(s),
    goTo: (id) => st.article.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: 'start' }),
    destroy: () => {
      cancelled = true
      st.destroy()
    },
  }
}

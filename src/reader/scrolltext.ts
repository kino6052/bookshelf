// Shared plumbing for the scrolled typographic readers (md, txt): font scale, progress, remembered position.
import type { ViewContext } from './types'
import { onScrollFrame } from './types'

export interface ScrollText {
  article: HTMLElement
  /** Index of the first block visible at the top of the viewport. */
  firstVisible(): number
  scrollToBlock(i: number): void
  setFontScale(s: number): void
  destroy(): void
}

/** Blocks carry data-i so the reading position survives font changes and chunked rendering. */
export function scrollText(ctx: ViewContext, kind: string, totalBlocks: () => number): ScrollText {
  const article = document.createElement('article')
  article.className = `reader-text reader-${kind}`
  article.style.setProperty('--font-scale', String(ctx.fontScale))
  article.lang = 'en'
  ctx.container.append(article)
  const c = ctx.container

  const firstVisible = (): number => {
    const top = c.getBoundingClientRect().top + 8
    // Binary search over blocks by their offsetTop.
    const blocks = article.querySelectorAll<HTMLElement>('[data-i]')
    let lo = 0
    let hi = blocks.length - 1
    let best = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const r = blocks[mid]!.getBoundingClientRect()
      if (r.bottom < top) lo = mid + 1
      else {
        best = mid
        hi = mid - 1
      }
    }
    return blocks.length ? Number(blocks[best]!.dataset.i) : 0
  }

  const report = () => {
    const total = totalBlocks()
    const i = firstVisible()
    const atEnd = c.scrollTop + c.clientHeight >= c.scrollHeight - 4
    ctx.setProgress(total ? (atEnd ? 1 : i / total) : undefined)
    ctx.savePosition(String(i))
  }
  const offScroll = onScrollFrame(c, report)

  return {
    article,
    firstVisible,
    scrollToBlock(i: number) {
      const el = article.querySelector<HTMLElement>(`[data-i="${i}"]`)
      if (el) c.scrollTop += el.getBoundingClientRect().top - c.getBoundingClientRect().top - 16
    },
    setFontScale(s: number) {
      const keep = firstVisible()
      article.style.setProperty('--font-scale', String(s))
      this.scrollToBlock(keep)
    },
    destroy() {
      offScroll()
    },
  }
}

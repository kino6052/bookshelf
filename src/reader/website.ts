// Website books: the live site in a sandboxed iframe when embedding is allowed, else a site card.
// Nothing from the site is requested before this view mounts (no prefetch, favicons or previews).
import { config } from '../config'
import { displayDomain } from '../shared/linkfile'
import { h } from '../ui/dom'
import type { FormatModule, FormatView } from './types'

export const fontControls = false

export const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups'

/** iframe | card, after the mixed-content rule (an http: site can't be embedded in an https: page). */
export function websiteMode(target: string, embed: 'auto' | 'iframe' | 'link' | undefined, pageProtocol: string): 'iframe' | 'card' {
  if (embed === 'link') return 'card'
  if (pageProtocol === 'https:' && target.startsWith('http:')) return 'card'
  return 'iframe'
}

function newTabLink(target: string, label: string, cls: string): HTMLAnchorElement {
  return h('a', { class: cls, href: target, target: '_blank', rel: 'noopener noreferrer' }, label)
}

export async function mount(ctx: Parameters<FormatModule['mount']>[0]): Promise<FormatView> {
  const { book } = ctx
  const target = book.target!
  const domain = displayDomain(target)
  const mode = websiteMode(target, book.embed, location.protocol)
  let iframe: HTMLIFrameElement | undefined
  let hintTimer: number | undefined

  const copy = h('button', {
    class: 'btn btn-small btn-quiet',
    type: 'button',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(target)
        copy.textContent = 'Copied ✓'
      } catch {
        copy.textContent = 'Copy failed'
      }
      setTimeout(() => (copy.textContent = 'Copy link'), 1600)
    },
  }, 'Copy link')
  const reload = h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => iframe && (iframe.src = target) }, 'Reload')
  ctx.tools.append(h('span', { class: 'site-domain' }, domain), mode === 'iframe' ? reload : '', newTabLink(target, 'Open in new tab ↗', 'btn btn-small btn-primary'), copy)

  const wrap = h('div', { class: `website website-${mode}` })
  ctx.container.append(wrap)
  if (mode === 'iframe') {
    iframe = h('iframe', { class: 'site-frame', title: `${book.title} (${domain})`, sandbox: IFRAME_SANDBOX, referrerpolicy: 'no-referrer', loading: 'eager', allow: 'fullscreen' })
    iframe.src = target
    wrap.append(iframe)
    if (book.embed !== 'iframe') {
      const hint = h('div', { class: 'site-hint', hidden: true }, 'Site not showing? Some sites refuse to be embedded. ', newTabLink(target, 'Open it in a new tab ↗', ''))
      wrap.append(hint)
      hintTimer = window.setTimeout(() => (hint.hidden = false), config.website.embedHintDelayMs)
    }
  } else {
    wrap.append(
      h(
        'div',
        { class: 'site-card' },
        h('div', { class: 'site-globe', 'aria-hidden': 'true' }, '🌐'),
        h('h3', {}, book.title),
        h('p', { class: 'site-card-domain' }, domain),
        h('p', { class: 'site-card-url' }, target),
        newTabLink(target, 'Open in new tab ↗', 'btn btn-primary btn-large'),
        target.startsWith('http:') && location.protocol === 'https:' ? h('p', { class: 'muted small' }, 'This site uses plain http, so it can’t be shown inside the library.') : '',
      ),
    )
  }
  ctx.setProgress(undefined, '')
  return {
    destroy: () => {
      clearTimeout(hintTimer)
      if (iframe) iframe.src = 'about:blank'
    },
  }
}

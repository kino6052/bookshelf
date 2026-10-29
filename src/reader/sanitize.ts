// DOMPurify with the reader's rules (md and html books): no scripts, styles, frames or form controls;
// links that leave the book open in a new tab.
import DOMPurify from 'dompurify'

let hooked = false
function installHooks(): void {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? ''
      if (href && !href.startsWith('#')) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }
  })
}

export function sanitize(html: string): string {
  installHooks()
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style'],
  })
}

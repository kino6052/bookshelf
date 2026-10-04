// Minimal YAML front-matter: flat `key: value` pairs only (all we need is title and author).

export interface FrontMatter {
  data: Record<string, string>
  /** Text after the closing fence (the whole text when there is no front-matter). */
  body: string
}

export function parseFrontMatter(text: string): FrontMatter {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const open = /^---[ \t]*\r?\n/.exec(src)
  if (!open) return { data: {}, body: src }
  const rest = src.slice(open[0].length)
  const close = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(rest)
  if (!close) return { data: {}, body: src }
  const data: Record<string, string> = {}
  for (const line of rest.slice(0, close.index).split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    let value = m[2]!.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value) data[m[1]!.toLowerCase()] = value
  }
  return { data, body: rest.slice(close.index + close[0].length) }
}

/** First "# Heading" in markdown, used to auto-detect a title client-side. */
export function firstMarkdownHeading(body: string): string | undefined {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(body)
  return m?.[1]?.trim() || undefined
}

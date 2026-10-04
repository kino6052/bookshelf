// Website books: parsing .url / .webloc link files and validating their targets.

export const MAX_TARGET_LENGTH = 2048

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** Parses a Windows Internet Shortcut. Tolerates a BOM, CRLF/LF and any key/section case. */
export function parseUrlFile(text: string): string | undefined {
  const lines = stripBom(text).split(/\r\n|\r|\n/)
  let inSection = false
  let sawSection = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    const section = /^\[(.+)\]$/.exec(line)
    if (section) {
      sawSection = true
      inSection = section[1]!.trim().toLowerCase() === 'internetshortcut'
      continue
    }
    if (sawSection && !inSection) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    if (line.slice(0, eq).trim().toLowerCase() === 'url') {
      const value = line.slice(eq + 1).trim()
      return value || undefined
    }
  }
  return undefined
}

/** Parses a macOS .webloc (XML plist). The URL is the <string> following <key>URL</key>, else the first <string>. */
export function parseWeblocFile(text: string): string | undefined {
  const xml = stripBom(text)
  const keyed = /<key>\s*URL\s*<\/key>\s*<string>([\s\S]*?)<\/string>/i.exec(xml)
  const any = keyed ?? /<string>([\s\S]*?)<\/string>/i.exec(xml)
  if (!any) return undefined
  const value = decodeXmlEntities(any[1]!.trim())
  return value || undefined
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

export type TargetCheck = { ok: true; url: string; hostname: string } | { ok: false; reason: string }

/** Only http(s), no embedded credentials, ≤ 2048 characters. Returns the normalized href. */
export function validateTarget(raw: string | undefined): TargetCheck {
  if (!raw) return { ok: false, reason: 'no URL' }
  const trimmed = raw.trim()
  if (trimmed.length > MAX_TARGET_LENGTH) return { ok: false, reason: `URL longer than ${MAX_TARGET_LENGTH} characters` }
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'not a valid absolute URL' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: `scheme ${u.protocol} is not allowed` }
  if (u.username || u.password) return { ok: false, reason: 'URL contains credentials' }
  if (!u.hostname) return { ok: false, reason: 'URL has no host' }
  if (u.href.length > MAX_TARGET_LENGTH) return { ok: false, reason: `URL longer than ${MAX_TARGET_LENGTH} characters` }
  return { ok: true, url: u.href, hostname: u.hostname }
}

/** "www.example.org" → "example.org"; punycode hosts are shown in Unicode where possible. */
export function displayDomain(urlOrHost: string): string {
  let host = urlOrHost
  try {
    host = new URL(urlOrHost).hostname
  } catch {
    // already a hostname
  }
  host = host.replace(/^www\./i, '')
  return punycodeToUnicode(host)
}

/** Minimal RFC 3492 decoder so IDN hosts read naturally on spines and labels. */
export function punycodeToUnicode(host: string): string {
  return host
    .split('.')
    .map((label) => {
      if (!/^xn--/i.test(label)) return label
      try {
        return decodePunycode(label.slice(4).toLowerCase())
      } catch {
        return label
      }
    })
    .join('.')
}

function decodePunycode(input: string): string {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700
  let n = 128, i = 0, bias = 72
  const output: number[] = []
  const basic = input.lastIndexOf('-')
  for (let j = 0; j < Math.max(basic, 0); j++) output.push(input.charCodeAt(j))
  const digit = (c: number) => (c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base)
  const adapt = (delta: number, numPoints: number, first: boolean) => {
    let k = 0
    delta = first ? Math.floor(delta / damp) : delta >> 1
    delta += Math.floor(delta / numPoints)
    for (; delta > ((base - tMin) * tMax) >> 1; k += base) delta = Math.floor(delta / (base - tMin))
    return Math.floor(k + ((base - tMin + 1) * delta) / (delta + skew))
  }
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length; ) {
    const oldi = i
    for (let w = 1, k = base; ; k += base) {
      if (idx >= input.length) throw new Error('bad punycode')
      const d = digit(input.charCodeAt(idx++))
      if (d >= base) throw new Error('bad punycode')
      i += d * w
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias
      if (d < t) break
      w *= base - t
    }
    bias = adapt(i - oldi, output.length + 1, oldi === 0)
    n += Math.floor(i / (output.length + 1))
    i %= output.length + 1
    output.splice(i++, 0, n)
  }
  return String.fromCodePoint(...output)
}

/** Body of a Windows .url file. CRLF so Windows tools read it. */
export function makeUrlFile(target: string): string {
  return `[InternetShortcut]\r\nURL=${target}\r\n`
}

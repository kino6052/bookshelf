// Minimal multi-page PDF writer for the seed library: standard Times fonts (WinAnsi), wrapped text,
// headings, page numbers and an /Info dictionary (title, author). No dependencies.

const WIDTHS_TIMES = [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541]
const WIDTHS_BOLD = [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520]

// Unicode → WinAnsi (cp1252) for the characters that differ from Latin-1.
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f }

function toWinAnsi(text) {
  const out = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) out.push(cp)
    else if (CP1252[cp]) out.push(CP1252[cp])
    else out.push(0x3f)
  }
  return out
}

function charWidth(code, bold) {
  const table = bold ? WIDTHS_BOLD : WIDTHS_TIMES
  if (code >= 32 && code <= 126) return table[code - 32]
  if (code === 0x91 || code === 0x92) return 333
  if (code === 0x93 || code === 0x94) return 444
  if (code === 0x96) return 500
  if (code === 0x97) return 1000
  return 500
}

function textWidth(codes, size, bold) {
  let w = 0
  for (const c of codes) w += charWidth(c, bold)
  return (w * size) / 1000
}

function pdfString(codes) {
  let s = '('
  for (const c of codes) {
    if (c === 0x28 || c === 0x29 || c === 0x5c) s += '\\' + String.fromCharCode(c)
    else if (c < 0x20 || c > 0x7e) s += '\\' + c.toString(8).padStart(3, '0')
    else s += String.fromCharCode(c)
  }
  return s + ')'
}

function wrap(text, size, bold, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let line = []
  for (const word of words) {
    const candidate = line.length ? [...line, word] : [word]
    if (line.length && textWidth(toWinAnsi(candidate.join(' ')), size, bold) > maxWidth) {
      lines.push(line.join(' '))
      line = [word]
    } else line = candidate
  }
  if (line.length) lines.push(line.join(' '))
  return lines
}

/**
 * blocks: [{ type: 'title' | 'heading' | 'para', text }]
 * Returns a Buffer with a complete PDF.
 */
export function makePdf({ title, author, subject, blocks }) {
  const W = 420, H = 595, margin = 54, bodySize = 11, lead = 15
  const pages = []
  let ops = []
  let y = H - margin
  const newPage = () => {
    if (ops.length) pages.push(ops)
    ops = []
    y = H - margin
  }
  const line = (text, size, bold, x = margin) => {
    if (y < margin + lead) newPage()
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(toWinAnsi(text))} Tj ET`)
    y -= size === bodySize ? lead : size * 1.35
  }
  for (const b of blocks) {
    if (b.type === 'title') {
      y = H * 0.62
      for (const l of wrap(b.text, 20, true, W - 2 * margin)) {
        const w = textWidth(toWinAnsi(l), 20, true)
        line(l, 20, true, (W - w) / 2)
      }
      y -= 12
      if (b.sub) for (const l of wrap(b.sub, 12, false, W - 2 * margin)) line(l, 12, false, (W - textWidth(toWinAnsi(l), 12, false)) / 2)
      newPage()
    } else if (b.type === 'heading') {
      if (y < H * 0.35) newPage()
      else y -= 10
      for (const l of wrap(b.text, 14, true, W - 2 * margin)) line(l, 14, true)
      y -= 6
    } else {
      const lines = wrap(b.text, bodySize, false, W - 2 * margin)
      lines.forEach((l, i) => line(l, bodySize, false, margin + (i === 0 ? 14 : 0)))
      y -= 4
    }
  }
  newPage()

  // Page numbers (skip the title page).
  pages.forEach((p, i) => {
    if (i === 0) return
    const n = String(i + 1)
    p.push(`BT /F1 9 Tf ${(W / 2 - textWidth(toWinAnsi(n), 9, false) / 2).toFixed(2)} 28 Td ${pdfString(toWinAnsi(n))} Tj ET`)
  })

  const objects = []
  const add = (body) => objects.push(body) // object number = index + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // pages, filled below
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>')
  const infoRef = objects.length + 1
  add(`<< /Title ${pdfString(toWinAnsi(title))} /Author ${pdfString(toWinAnsi(author))} /Subject ${pdfString(toWinAnsi(subject ?? ''))} /Producer (bookshelf seed script) >>`)
  const kids = []
  for (const p of pages) {
    const content = p.join('\n')
    add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`)
    const contentRef = objects.length
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`)
    kids.push(`${objects.length} 0 R`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoRef} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

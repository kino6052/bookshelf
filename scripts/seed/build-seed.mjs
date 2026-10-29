// Rebuilds the seed library in books/ from Project Gutenberg files.
// Usage: node scripts/seed/build-seed.mjs <cache-dir>
// The cache dir holds the downloaded pg*.txt / pg*.epub files (see SEEDS below for the exact names and URLs).
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { makePdf } from './pdf.mjs'

const cache = process.argv[2]
if (!cache) {
  console.error('usage: node scripts/seed/build-seed.mjs <cache-dir>')
  process.exit(1)
}
const books = path.resolve('books')

const PG = (id) => `https://www.gutenberg.org/ebooks/${id}`
const SEEDS = [
  { shelf: '01-ancient', file: 'Plato - Apology.md', pg: 1656, src: 'pg1656.txt', kind: 'md', work: 'Apology', by: 'Plato, tr. Benjamin Jowett', startAt: 'INTRODUCTION.', translator: 'Benjamin Jowett' },
  { shelf: '01-ancient', file: 'Plato - The Republic.epub', pg: 1497, src: 'pg1497-images-3.epub', kind: 'copy', work: 'The Republic', by: 'Plato, tr. Benjamin Jowett' },
  { shelf: '01-ancient', file: 'Aristotle - The Nicomachean Ethics.txt', pg: 8438, src: 'pg8438.txt', kind: 'copy', work: 'The Nicomachean Ethics', by: 'Aristotle, tr. F. H. Peters' },
  { shelf: '02-medieval', file: 'Augustine - The Confessions.epub', pg: 3296, src: 'pg3296-images-3.epub', kind: 'copy', work: 'The Confessions', by: 'Augustine of Hippo, tr. E. B. Pusey' },
  { shelf: '02-medieval', file: 'Boethius - The Consolation of Philosophy.txt', pg: 14328, src: 'pg14328.txt', kind: 'copy', work: 'The Consolation of Philosophy', by: 'Boethius, tr. H. R. James' },
  { shelf: '02-medieval', file: 'Aquinas - Summa Theologica, Part I.epub', pg: 17611, src: 'pg17611-images-3.epub', kind: 'copy', work: 'Summa Theologica, Part I (Prima Pars)', by: 'Thomas Aquinas, tr. Fathers of the English Dominican Province' },
  { shelf: '03-rationalists', file: 'Descartes - Discourse on the Method.pdf', pg: 59, src: 'pg59.txt', kind: 'pdf', work: 'Discourse on the Method', by: 'René Descartes, tr. John Veitch', startAt: 'PREFATORY NOTE BY THE AUTHOR', title: 'Discourse on the Method', author: 'René Descartes' },
  { shelf: '03-rationalists', file: 'Spinoza - Ethics, Part I.epub', pg: 919, src: 'pg919-images-3.epub', kind: 'copy', work: 'Ethics — Part 1', by: 'Benedict de Spinoza, tr. R. H. M. Elwes' },
  { shelf: '04-empiricists', file: 'Locke - An Essay Concerning Humane Understanding, Volume 1.txt', pg: 10615, src: 'pg10615.txt', kind: 'copy', work: 'An Essay Concerning Humane Understanding, Vol. 1', by: 'John Locke' },
  { shelf: '04-empiricists', file: 'Berkeley - A Treatise Concerning the Principles of Human Knowledge.epub', pg: 4723, src: 'pg4723-images-3.epub', kind: 'copy', work: 'A Treatise Concerning the Principles of Human Knowledge', by: 'George Berkeley' },
  // Annotated by hand (a summary per paragraph), so the file in books/ is the source and is never rebuilt.
  { shelf: '04-empiricists', file: 'Hume - An Enquiry Concerning Human Understanding.html', pg: 9662, src: 'pg9662-images-3.epub', kind: 'annotated', work: 'An Enquiry Concerning Human Understanding', by: 'David Hume' },
  { shelf: '05-kant-and-after', file: 'Kant - The Critique of Pure Reason.epub', pg: 4280, src: 'pg4280-images-3.epub', kind: 'copy', work: 'The Critique of Pure Reason', by: 'Immanuel Kant, tr. J. M. D. Meiklejohn' },
  { shelf: '05-kant-and-after', file: 'Kant - Fundamental Principles of the Metaphysic of Morals.pdf', pg: 5682, src: 'pg5682.txt', kind: 'pdf', work: 'Fundamental Principles of the Metaphysic of Morals', by: 'Immanuel Kant, tr. Thomas Kingsmill Abbott', startAt: 'PREFACE', title: 'Fundamental Principles of the Metaphysic of Morals', author: 'Immanuel Kant' },
  { shelf: '06-everything-else', file: 'Tolstoy - War and Peace.txt', pg: 2600, src: 'pg2600.txt', kind: 'copy', work: 'War and Peace', by: 'Leo Tolstoy, tr. Louise and Aylmer Maude' },
  { shelf: '06-everything-else', file: 'Austen - Pride and Prejudice.epub', pg: 1342, src: 'pg1342.epub', kind: 'copy', work: 'Pride and Prejudice', by: 'Jane Austen' },
]
const LINKS = [
  { shelf: '04-empiricists', file: 'IEP - Internet Encyclopedia of Philosophy.url', url: 'https://iep.utm.edu/', embed: 'iframe' },
  { shelf: '06-everything-else', file: 'SEP - Stanford Encyclopedia of Philosophy.url', url: 'https://plato.stanford.edu/', embed: 'iframe' },
]

/** Text between the Gutenberg START/END markers, optionally from a heading onwards. */
function gutenbergBody(text, startAt) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((l) => l.startsWith('*** START OF'))
  const end = lines.findIndex((l) => l.startsWith('*** END OF'))
  let body = lines.slice(start + 1, end)
  if (startAt) {
    const i = body.findIndex((l) => l.trim() === startAt)
    if (i < 0) throw new Error(`marker "${startAt}" not found`)
    body = body.slice(i)
  }
  return body.join('\n')
}

const isHeading = (block) => {
  const t = block.trim()
  return !t.includes('\n') && t.length < 70 && /[A-Z]/.test(t) && t === t.toUpperCase() && !/[a-z]/.test(t)
}

function blocksOf(body) {
  return body
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => (isHeading(b) ? { type: 'heading', text: titleCase(b.replace(/\.$/, '')) } : { type: 'para', text: b.replace(/\s*\n\s*/g, ' ') }))
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s(—-])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/\b(Of|The|And|In|On|To|A)\b(?!$)/g, (w, _m, i) => (i === 0 ? w : w.toLowerCase()))
}

function mdEscape(text) {
  return text.replace(/^([#>*+-]|\d+\.)/, '\\$1')
}

async function main() {
  const sources = []
  for (const s of SEEDS) {
    const dir = path.join(books, s.shelf)
    await mkdir(dir, { recursive: true })
    const out = path.join(dir, s.file)
    const src = path.join(cache, s.src)
    if (s.kind === 'copy') {
      await copyFile(src, out)
    } else if (s.kind === 'md') {
      const blocks = blocksOf(gutenbergBody(await readFile(src, 'utf8'), s.startAt))
      const md = [
        '---',
        `title: ${s.work}`,
        `author: Plato`,
        `translator: ${s.translator}`,
        `source: ${PG(s.pg)}`,
        '---',
        '',
        `# ${s.work}`,
        '',
        `*Translated by ${s.translator}. Text from Project Gutenberg eBook #${s.pg}; public domain.*`,
        '',
        ...blocks.map((b) => (b.type === 'heading' ? `## ${b.text}\n` : `${mdEscape(b.text)}\n`)),
      ].join('\n')
      await writeFile(out, md)
    } else if (s.kind === 'pdf') {
      const blocks = blocksOf(gutenbergBody(await readFile(src, 'utf8'), s.startAt))
      const pdf = makePdf({ title: s.title, author: s.author, subject: `${s.by}. Project Gutenberg eBook #${s.pg}`, blocks: [{ type: 'title', text: s.title, sub: s.by }, ...blocks] })
      await writeFile(out, pdf)
    }
    sources.push(s)
    console.log(s.kind === 'annotated' ? 'kept' : 'wrote', path.relative(process.cwd(), out))
  }
  for (const l of LINKS) {
    const dir = path.join(books, l.shelf)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, l.file), `[InternetShortcut]\r\nURL=${l.url}\r\n`)
    await writeFile(path.join(dir, `${l.file}.meta.json`), JSON.stringify({ embed: l.embed }, null, 2) + '\n')
    console.log('wrote', l.file)
  }

  const rows = sources.map((s) => {
    const how = {
      copy: 'Gutenberg file, unchanged (Project Gutenberg License included in the file)',
      md: 'Converted to Markdown by `scripts/seed/build-seed.mjs`; Gutenberg header/footer removed',
      pdf: 'Typeset to PDF by `scripts/seed/build-seed.mjs`; Gutenberg header/footer removed',
      annotated: 'Text of the Gutenberg epub as HTML, each paragraph folded to a new summary (kept in the repo, not rebuilt); Gutenberg header/footer and index removed',
    }[s.kind]
    return `| \`${s.shelf}/${s.file}\` | ${s.work} | ${s.by} | [PG #${s.pg}](${PG(s.pg)}) | Public domain in the USA | ${how} |`
  })
  const linkRows = LINKS.map((l) => `| \`${l.shelf}/${l.file}\` | ${l.url} | link only (no content copied) | embeddable: no \`X-Frame-Options\` or CSP \`frame-ancestors\` when checked on 2026-10-04 → \`embed: ${l.embed}\` |`)
  await writeFile(
    path.join(books, 'SOURCES.md'),
    `# Seed library sources

Every seed book is a public-domain work. Licence status was checked on each Project Gutenberg
ebook page ("Copyright Status: Public domain in the USA") on 2026-10-04. Works were looked up by
title in the official catalogue (\`https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv\`).

Rebuild with \`node scripts/seed/build-seed.mjs <cache-dir>\` after downloading the files named in that script.
This file is ignored by the scanner (files directly in \`books/\` are never books).

| File | Work | Author / translator | Source | Licence | Notes |
|---|---|---|---|---|---|
${rows.join('\n')}

## Website books

| File | Target | Copy | Embedding |
|---|---|---|---|
${linkRows.join('\n')}
`,
  )
  console.log('wrote books/SOURCES.md')
}

await main()

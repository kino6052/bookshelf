import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scanLibrary, type ScanResult } from '../server/scan'
import { makeTree } from './helpers/fixture'

let result: ScanResult
let cleanup: () => Promise<void>

beforeAll(async () => {
  const t = await makeTree({
    books: {
      'SOURCES.md': '# sources',
      'stray.pdf': '%PDF-1.4',
      '01-ancient': {
        'Plato - The Republic.md': '# Republic',
        'Aristotle - Ethics.txt': 'text',
        'Aristotle - Ethics.txt.meta.json': '{"title": "Nicomachean Ethics", "spineColor": "#AA3344"}',
        'Zeno - Paradoxes.md': '---\ntitle: "On Motion"\nauthor: Zeno of Elea\n---\n# Heading\n',
        'Anonymous Fragments.md': 'x',
        'Pinned - First.txt': 'x',
        'Pinned - First.txt.meta.json': '{"order": 1}',
        '.DS_Store': 'x',
        'Thumbs.db': 'x',
        'desktop.ini': 'x',
        'notes.json': '{}',
        'download.pdf.part': 'x',
        'tmp.tmp': 'x',
        'big.epub.crdownload': 'x',
        'cover.jpg': 'x',
        'cover2.jpg': 'x',
        'nested': { 'Hidden - Book.md': 'x' },
      },
      '03-rationalists': {
        'shelf.json': '{"title": "The Rationalists"}',
        'Spinoza - Ethics (Ἠθική) #1 & 50%.epub': 'PK',
        'Descartes - Meditations.pdf': '%PDF-1.4',
        'Descartes - Meditations.pdf.meta.json': '{ not json',
        '孔子 - 論語.txt': 'x',
      },
      'zz-poetry': {},
      'apocrypha': { 'Some Book.txt': 'x' },
      'late': { 'shelf.json': '{"order": 2}' },
      '.hidden-shelf': { 'A - B.md': 'x' },
    },
    music: {
      '01 - Morning Light.mp3': 'x',
      'rain_loop.ogg': 'x',
      'readme.txt': 'x',
    },
  })
  cleanup = t.cleanup
  result = await scanLibrary({ booksDir: path.join(t.root, 'books'), musicDir: path.join(t.root, 'music') })
})

afterAll(() => cleanup())

const shelf = (id: string) => result.library.shelves.find((s) => s.id === id)!
const book = (id: string) => result.library.shelves.flatMap((s) => s.books).find((b) => b.id === id)

describe('scanLibrary', () => {
  it('orders shelves: shelf.json order / NN- prefix, then unnumbered alphabetically', () => {
    expect(result.library.shelves.map((s) => s.id)).toEqual(['01-ancient', 'late', '03-rationalists', 'apocrypha', 'zz-poetry'])
    expect(shelf('late').order).toBe(2)
    expect(shelf('apocrypha').order).toBe(4)
    expect(shelf('zz-poetry').order).toBe(5)
  })

  it('titles shelves from shelf.json or the folder name', () => {
    expect(shelf('01-ancient').title).toBe('Ancient')
    expect(shelf('03-rationalists').title).toBe('The Rationalists')
    expect(shelf('zz-poetry').title).toBe('Zz Poetry')
  })

  it('keeps an empty folder as an empty shelf', () => {
    expect(shelf('zz-poetry').books).toEqual([])
  })

  it('orders books by meta.order, then author, then title (authorless last)', () => {
    expect(shelf('01-ancient').books.map((b) => b.id)).toEqual([
      '01-ancient/Pinned - First.txt',
      '01-ancient/Aristotle - Ethics.txt',
      '01-ancient/Plato - The Republic.md',
      '01-ancient/Zeno - Paradoxes.md',
      '01-ancient/Anonymous Fragments.md',
    ])
  })

  it('applies metadata precedence: sidecar → front-matter → filename → humanized', () => {
    expect(book('01-ancient/Aristotle - Ethics.txt')).toMatchObject({ title: 'Nicomachean Ethics', author: 'Aristotle', spineColor: '#aa3344', format: 'txt' })
    expect(book('01-ancient/Zeno - Paradoxes.md')).toMatchObject({ title: 'On Motion', author: 'Zeno of Elea' })
    expect(book('01-ancient/Plato - The Republic.md')).toMatchObject({ title: 'The Republic', author: 'Plato' })
    const anon = book('01-ancient/Anonymous Fragments.md')!
    expect(anon.title).toBe('Anonymous Fragments')
    expect(anon.author).toBeUndefined()
  })

  it('ignores dotfiles, system files, stray json, partial downloads and unknown extensions (warning once each)', () => {
    const ids = shelf('01-ancient').books.map((b) => b.id)
    for (const name of ['.DS_Store', 'Thumbs.db', 'desktop.ini', 'notes.json', 'download.pdf.part', 'tmp.tmp', 'big.epub.crdownload', 'cover.jpg']) {
      expect(ids).not.toContain(`01-ancient/${name}`)
    }
    expect(result.warnings.filter((w) => w.includes('".jpg"'))).toHaveLength(1)
    expect(result.warnings.some((w) => w.includes('.part') || w.includes('.tmp') || w.includes('crdownload'))).toBe(false)
  })

  it('only scans one level deep and warns about nested folders', () => {
    expect(book('01-ancient/nested/Hidden - Book.md')).toBeUndefined()
    expect(result.warnings.filter((w) => w.includes('nested'))).toHaveLength(1)
  })

  it('never treats files directly in books/ as books, and skips hidden shelves', () => {
    const all = result.library.shelves.flatMap((s) => s.books.map((b) => b.id))
    expect(all.some((id) => !id.includes('/'))).toBe(false)
    expect(result.library.shelves.find((s) => s.id === '.hidden-shelf')).toBeUndefined()
  })

  it('URL-encodes names with spaces, Unicode, #, % and &, and uses / in ids', () => {
    const b = book('03-rationalists/Spinoza - Ethics (Ἠθική) #1 & 50%.epub')!
    expect(b.format).toBe('epub')
    expect(b.url).toBe(`books/03-rationalists/${encodeURIComponent('Spinoza - Ethics (Ἠθική) #1 & 50%.epub')}?v=${b.mtime}`)
    expect(b.url).not.toMatch(/[ #&]|%(?![0-9A-F]{2})/)
    expect(b).toMatchObject({ author: 'Spinoza', title: 'Ethics (Ἠθική) #1 & 50%' })
    const cjk = book('03-rationalists/孔子 - 論語.txt')!
    expect(cjk).toMatchObject({ author: '孔子', title: '論語' })
    expect(decodeURIComponent(cjk.url.split('?')[0]!)).toBe('books/03-rationalists/孔子 - 論語.txt')
  })

  it('falls back to the filename when a sidecar is bad JSON, with a warning', () => {
    expect(book('03-rationalists/Descartes - Meditations.pdf')).toMatchObject({ title: 'Meditations', author: 'Descartes', format: 'pdf' })
    expect(result.warnings.some((w) => w.includes('Descartes - Meditations.pdf.meta.json') && w.includes('bad JSON'))).toBe(true)
  })

  it('fills bytes and mtime and a cache-busting url', () => {
    const b = book('01-ancient/Plato - The Republic.md')!
    expect(b.bytes).toBe('# Republic'.length)
    expect(b.mtime).toBe(1_700_000_000_000)
    expect(b.url).toBe('books/01-ancient/Plato%20-%20The%20Republic.md?v=1700000000000')
  })

  it('lists music tracks with titles from filenames', () => {
    expect(result.library.tracks).toEqual([
      { id: '01 - Morning Light.mp3', url: 'music/01%20-%20Morning%20Light.mp3?v=1700000000000', title: 'Morning Light' },
      { id: 'rain_loop.ogg', url: 'music/rain_loop.ogg?v=1700000000000', title: 'rain loop' },
    ])
  })

  it('survives a missing books folder', async () => {
    const r = await scanLibrary({ booksDir: path.join(process.cwd(), 'does-not-exist'), musicDir: path.join(process.cwd(), 'nope') })
    expect(r.library).toEqual({ version: 1, shelves: [], tracks: [] })
    expect(r.warnings).toHaveLength(1)
  })
})

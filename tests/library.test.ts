import { describe, expect, it } from 'vitest'
import { diffLibrary } from '../src/shared/diff'
import { makeStressLibrary } from '../src/shared/stress'
import type { Book, Library } from '../src/shared/types'
import { validateLibrary } from '../src/shared/validate'

const book = (id: string, extra: Partial<Book> = {}): Book => ({
  id: `s1/${id}`, shelfId: 's1', url: `books/s1/${encodeURIComponent(id)}?v=1`, format: 'md', title: id, bytes: 10, mtime: 1, ...extra,
})
const lib = (books: Book[], tracks: Library['tracks'] = []): Library => ({ version: 1, shelves: [{ id: 's1', title: 'S1', order: 1, books }], tracks })

describe('validateLibrary', () => {
  it('passes a well-formed manifest through unchanged', () => {
    const good = lib([book('a.md', { author: 'A', spineColor: '#112233' }), book('w.url', { format: 'url', target: 'https://example.org/', embed: 'iframe' })], [{ id: 't.mp3', url: 'music/t.mp3?v=1', title: 't' }])
    const { library, warnings } = validateLibrary(JSON.parse(JSON.stringify(good)))
    expect(warnings).toEqual([])
    expect(library).toEqual(good)
  })

  it('skips malformed entries with warnings and never throws', () => {
    const raw = {
      version: 1,
      shelves: [
        { id: 's1', title: 'S1', order: 1, books: [
          book('ok.md'),
          { ...book('abs.md'), url: 'https://evil.example/x.md' },
          { ...book('js.md'), url: 'javascript:alert(1)' },
          { ...book('trav.md'), url: 'books/%2e%2e/secret' },
          { ...book('fmt.md'), format: 'exe' },
          { ...book('notitle.md'), title: '' },
          { ...book('web.url'), format: 'url', target: 'javascript:alert(1)' },
          { ...book('ok.md') },
          { ...book('wrongshelf.md'), shelfId: 'other' },
          null, 42, 'x',
        ] },
        { id: 's1', title: 'dup', order: 2, books: [] },
        { title: 'no id', order: 3, books: [] },
        'garbage',
      ],
      tracks: [{ id: 't', url: 'http://evil.example/t.mp3', title: 't' }, { id: 'u', url: 'music/u.mp3', title: 'u' }],
    }
    const { library, warnings } = validateLibrary(raw)
    expect(library.shelves.map((s) => s.id)).toEqual(['s1'])
    expect(library.shelves[0]!.books.map((b) => b.id)).toEqual(['s1/ok.md'])
    expect(library.tracks.map((t) => t.id)).toEqual(['u'])
    expect(warnings.length).toBeGreaterThanOrEqual(12)
    for (const bad of [null, undefined, 1, 'x', [], { shelves: 'nope' }]) {
      expect(() => validateLibrary(bad)).not.toThrow()
      expect(validateLibrary(bad).library.shelves).toEqual([])
    }
  })

  it('defaults a missing embed to auto', () => {
    const raw = lib([book('w.url', { format: 'url', target: 'https://example.org/' })])
    expect(validateLibrary(raw).library.shelves[0]!.books[0]!.embed).toBe('auto')
  })
})

describe('diffLibrary', () => {
  it('reports added, removed and changed books', () => {
    const a = lib([book('a.md'), book('b.md'), book('c.md')])
    const b = lib([book('a.md'), book('c.md', { mtime: 2, url: 'books/s1/c.md?v=2' }), book('d.md')])
    const d = diffLibrary(a, b)
    expect(d.added.map((x) => x.id)).toEqual(['s1/d.md'])
    expect(d.removed.map((x) => x.id)).toEqual(['s1/b.md'])
    expect(d.changed.map((x) => x.id)).toEqual(['s1/c.md'])
    expect(d.shelvesChanged).toBe(true)
    expect(d.unchanged).toBe(false)
  })

  it('is empty for identical libraries and notices track and shelf-title changes', () => {
    const a = lib([book('a.md')])
    expect(diffLibrary(a, structuredClone(a)).unchanged).toBe(true)
    const renamed = structuredClone(a)
    renamed.shelves[0]!.title = 'Renamed'
    expect(diffLibrary(a, renamed)).toMatchObject({ shelvesChanged: true, unchanged: false, added: [], removed: [] })
    expect(diffLibrary(a, lib([book('a.md')], [{ id: 't', url: 'music/t', title: 't' }])).tracksChanged).toBe(true)
  })
})

describe('makeStressLibrary', () => {
  it.each([0, 1, 30, 300, 1000])('N=%i gives a valid manifest with exactly N books', (n) => {
    const l = makeStressLibrary(n)
    const { library, warnings } = validateLibrary(JSON.parse(JSON.stringify(l)))
    expect(warnings).toEqual([])
    expect(library.shelves.flatMap((s) => s.books)).toHaveLength(n)
    expect(makeStressLibrary(n)).toEqual(l)
  })

  it('makes about 10% website books', () => {
    const books = makeStressLibrary(1000).shelves.flatMap((s) => s.books)
    const web = books.filter((b) => b.format === 'url')
    expect(web.length).toBeGreaterThan(70)
    expect(web.length).toBeLessThan(130)
    expect(web.every((b) => b.target?.startsWith('https://'))).toBe(true)
  })
})

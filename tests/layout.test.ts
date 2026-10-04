import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { bookSize, footprint, layout, toWorld, type AABB, type BoxPlacement, type Layout } from '../src/shared/layout'
import { makeStressLibrary } from '../src/shared/stress'
import type { Book, Library } from '../src/shared/types'

const EPS = 1e-6

function overlaps3d(a: BoxPlacement, b: BoxPlacement): boolean {
  const fa = footprint(a)
  const fb = footprint(b)
  const xz = fa.minX < fb.maxX - EPS && fb.minX < fa.maxX - EPS && fa.minZ < fb.maxZ - EPS && fb.minZ < fa.maxZ - EPS
  const y = a.y - a.height / 2 < b.y + b.height / 2 - EPS && b.y - b.height / 2 < a.y + a.height / 2 - EPS
  return xz && y
}

const intersects = (a: AABB, b: AABB) => a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS

function manyShelves(shelves: number, perShelf: number): Library {
  return {
    version: 1,
    tracks: [],
    shelves: Array.from({ length: shelves }, (_, s) => ({
      id: `s${s}`,
      title: `Shelf ${s}`,
      order: s,
      books: Array.from({ length: perShelf }, (_, i): Book => ({ id: `s${s}/b${i}.md`, shelfId: `s${s}`, url: `books/s${s}/b${i}.md`, format: 'md', title: `B${i}`, bytes: 200_000 + i * 1000, mtime: 1 })),
    })),
  }
}

function checkInvariants(lib: Library, l: Layout, authoring: boolean) {
  const all = lib.shelves.flatMap((s) => s.books)
  // No dropped or duplicated books, in reading order.
  expect(l.books.map((b) => b.bookId)).toEqual(all.map((b) => b.id))

  // No overlaps between books (and "+" slots) on the same board.
  const byBoard = new Map<number, BoxPlacement[]>()
  for (const p of [...l.books, ...l.plusSlots]) {
    const board = 'board' in p ? (p as { board: number }).board : -1
    byBoard.set(board, [...(byBoard.get(board) ?? []), p])
  }
  for (const items of byBoard.values()) {
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) expect(overlaps3d(items[i]!, items[j]!)).toBe(false)
  }

  // Every book sits inside its section, on a board within reach (top board ≤ 2.1 m).
  for (const b of l.books) {
    expect(b.y - b.height / 2).toBeGreaterThanOrEqual(config.bookcase.lowestBoard - EPS)
    expect(b.y - b.height / 2).toBeLessThanOrEqual(2.1 + config.bookcase.boardThickness)
    const f = footprint(b)
    expect(f.minX).toBeGreaterThan(l.room.minX)
    expect(f.maxX).toBeLessThan(l.room.maxX)
    expect(f.minZ).toBeGreaterThan(l.room.minZ)
    expect(f.maxZ).toBeLessThan(l.room.maxZ)
  }

  // Aisles: the 1.2 m in front of every section is inside the room and free of other bookcases.
  for (const s of l.sections) {
    const a = toWorld(s, -s.width / 2 + 0.01, s.depth / 2 + 0.001)
    const b = toWorld(s, s.width / 2 - 0.01, s.depth / 2 + 1.2)
    const clear: AABB = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) }
    expect(clear.minX).toBeGreaterThanOrEqual(l.room.minX - EPS)
    expect(clear.maxX).toBeLessThanOrEqual(l.room.maxX + EPS)
    expect(clear.minZ).toBeGreaterThanOrEqual(l.room.minZ - EPS)
    expect(clear.maxZ).toBeLessThanOrEqual(l.room.maxZ + EPS)
    for (const c of l.colliders) expect(intersects(clear, c), `section ${s.index} aisle`).toBe(false)
  }

  // Authoring reserve: exactly one "+" slot per shelf, after the shelf's last book.
  expect(l.plusSlots.length).toBe(authoring ? lib.shelves.length : 0)
  if (authoring) {
    for (const shelf of lib.shelves) {
      const slot = l.plusSlots.find((p) => p.shelfId === shelf.id)!
      const last = [...l.books].reverse().find((b) => b.shelfId === shelf.id)
      if (last) expect(slot.board).toBeGreaterThanOrEqual(last.board)
    }
  }
  // Each shelf starts on a fresh board with a name plate.
  expect(l.plates.map((p) => p.shelfId)).toEqual(lib.shelves.map((s) => s.id))
  const firstBoards = lib.shelves.map((s) => l.boards.findIndex((b) => b.shelfId === s.id))
  expect(new Set(firstBoards).size).toBe(firstBoards.length)
}

describe('layout', () => {
  for (const n of [0, 1, 30, 300, 1000]) {
    for (const authoring of [false, true]) {
      it(`N=${n} authoring=${authoring}: deterministic, no overlaps, nothing dropped, aisles ≥ 1.2 m`, () => {
        const lib = makeStressLibrary(n)
        const l = layout(lib, { authoring })
        expect(layout(structuredClone(lib), { authoring })).toEqual(l)
        checkInvariants(lib, l, authoring)
      })
    }
  }

  it('fills the perimeter first and keeps the base room for small libraries', () => {
    const l = layout(makeStressLibrary(300), { authoring: false })
    expect(l.room.length).toBe(config.room.length)
    expect(l.stacks).toHaveLength(0)
    const usedSections = new Set(l.books.map((b) => l.boards[b.board]!.section))
    const usedRuns = new Set([...usedSections].map((s) => l.sections[s]!.run))
    expect([...usedRuns].every((r) => l.runs[r]!.kind === 'wall')).toBe(true)
  })

  it('builds only the bookcases a 50–300 book library needs, plus one spare, starting on the north wall', () => {
    for (const n of [0, 17, 50, 150, 300]) {
      const lib = makeStressLibrary(n)
      const l = layout(lib, { authoring: false })
      const levels = config.bookcase.levels
      expect(l.sections.length, `N=${n}`).toBe(Math.max(2, Math.ceil(l.boardsUsed / levels) + 1))
      expect(l.runs[0]!.nz).toBe(1) // north wall faces +z and comes first
      expect(l.sections.every((s) => s.run === 0) || n > 300).toBe(true)
    }
  })

  it('moves on to freestanding stacks and grows the room when the walls are full', () => {
    const lib = manyShelves(400, 3)
    const l = layout(lib, { authoring: true })
    expect(l.room.length).toBeGreaterThan(config.room.length)
    const usedRuns = new Set(l.books.map((b) => l.sections[l.boards[b.board]!.section]!.run))
    expect([...usedRuns].some((r) => l.runs[r]!.kind === 'stack')).toBe(true)
    checkInvariants(lib, l, true)
  })

  it('spans consecutive boards for a big shelf', () => {
    const lib = manyShelves(1, 80)
    const l = layout(lib, { authoring: false })
    const boards = [...new Set(l.books.map((b) => b.board))]
    expect(boards.length).toBeGreaterThan(1)
    expect(boards).toEqual(boards.map((_, i) => boards[0]! + i))
  })

  it('adding a book only moves the books after it in that shelf (and later shelves)', () => {
    const lib = manyShelves(4, 20)
    const before = layout(lib, { authoring: true })
    const grown = structuredClone(lib)
    grown.shelves[1]!.books.splice(10, 0, { id: 's1/new.md', shelfId: 's1', url: 'books/s1/new.md', format: 'md', title: 'New', bytes: 50_000, mtime: 2 })
    const after = layout(grown, { authoring: true })
    const pos = (l: Layout) => new Map(l.books.map((b) => [b.bookId, b]))
    const a = pos(before)
    const b = pos(after)
    for (const shelf of lib.shelves.slice(0, 1)) for (const book of shelf.books) expect(b.get(book.id)).toEqual(a.get(book.id))
    for (const book of lib.shelves[1]!.books.slice(0, 10)) expect(b.get(book.id)).toEqual(a.get(book.id))
    expect(b.get(lib.shelves[1]!.books[10]!.id)).not.toEqual(a.get(lib.shelves[1]!.books[10]!.id))
  })

  it('sizes books deterministically within the spec ranges; website books are slim', () => {
    const paper = bookSize({ id: 'x/a.pdf', bytes: 3_000_000, format: 'pdf' })
    expect(bookSize({ id: 'x/a.pdf', bytes: 3_000_000, format: 'pdf' })).toEqual(paper)
    expect(paper.thickness).toBeGreaterThanOrEqual(0.015)
    expect(paper.thickness).toBeLessThanOrEqual(0.06)
    expect(paper.height).toBeGreaterThanOrEqual(0.2)
    expect(paper.height).toBeLessThanOrEqual(0.3)
    expect(paper.depth).toBeGreaterThanOrEqual(0.15)
    expect(paper.depth).toBeLessThanOrEqual(0.22)
    expect(bookSize({ id: 'x/tiny.md', bytes: 10, format: 'md' }).thickness).toBeCloseTo(0.015, 2)
    expect(bookSize({ id: 'x/w.url', bytes: 60, format: 'url' }).thickness).toBe(0.01)
  })

  it('fits roughly 25–30 average books on a board', () => {
    const avg = manyShelves(1, 200).shelves[0]!.books.reduce((n, b) => n + bookSize(b).thickness, 0) / 200
    const perBoard = (config.bookcase.boardWidth - config.bookcase.sidePanel) / (avg + config.book.gap)
    expect(perBoard).toBeGreaterThan(20)
    expect(perBoard).toBeLessThan(40)
  })

  it('gives an empty shelf a board and a plate', () => {
    const lib: Library = { version: 1, tracks: [], shelves: [{ id: 'empty', title: 'Empty', order: 1, books: [] }] }
    const l = layout(lib, { authoring: true })
    expect(l.plates).toHaveLength(1)
    expect(l.plusSlots).toHaveLength(1)
    expect(l.boardsUsed).toBe(1)
  })
})

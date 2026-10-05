// Pure, deterministic layout: library → bookcase sections, compartments, books, plates, "+" slots and decor.
//
// The whole north wall is one bookcase in a walnut-and-steel style: cabinets below (some with doors, some
// open cubbies), three open boards at comfortable heights (books sit between 1 m and ~2.1 m) split by
// staggered dividers into boxes of different widths. Books fill compartments in reading order (section by
// section, top to bottom, left to right); each shelf starts in a fresh compartment. If the library outgrows
// the wall the room gets longer. Empty compartments and cubbies (and wide gaps after a shelf's last book)
// get a few simple items.
//
// World frame: x along the long window wall (room centred on x = 0), z from the north wall (−depth/2)
// to the window wall (+depth/2), y up. A section's local +z points out of the bookcase into the room;
// local +x is the viewer's right when facing it, so "left → right" is +x.
import { config } from '../config.ts'
import { hash01, hashString, mulberry32 } from './hash.ts'
import type { Book, Library } from './types.ts'

export interface AABB {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface Frame {
  x: number
  z: number
  /** Yaw: local +x maps to (cos, 0, −sin), local +z to (sin, 0, cos). */
  rotY: number
}

export interface SectionPlacement extends Frame {
  index: number
  width: number
  depth: number
  height: number
  /** Cabinet below the boards: doors, or open cubbies holding decor. */
  cabinet: 'doors' | 'cubbies'
}

export interface BoxPlacement extends Frame {
  /** Centre height. */
  y: number
  width: number
  height: number
  depth: number
}

export interface BookPlacement extends BoxPlacement {
  bookId: string
  shelfId: string
  /** Compartment index. */
  board: number
  color: string
  website: boolean
}

export interface PlatePlacement extends BoxPlacement {
  shelfId: string
  title: string
}

export interface PlusPlacement extends BoxPlacement {
  shelfId: string
  board: number
}

export type DecorKind = 'plant' | 'vase' | 'stack' | 'box' | 'candles' | 'globe' | 'frame' | 'basket'

export interface DecorPlacement extends Frame {
  kind: DecorKind
  /** Height of the surface the item stands on. */
  y: number
  width: number
  /** Compartment index, or −1 for the cabinet cubbies. */
  board: number
  /** Deterministic per-item variation (colours, proportions). */
  seed: number
}

/** A box on one board between two dividers (or a divider and the frame). x0/x1 are local to the section. */
export interface BoardInfo {
  index: number
  section: number
  level: number
  x0: number
  x1: number
  shelfId?: string
}

export interface Layout {
  room: { length: number; depth: number; height: number; minX: number; maxX: number; minZ: number; maxZ: number }
  sections: SectionPlacement[]
  /** Compartments in reading order. */
  boards: BoardInfo[]
  books: BookPlacement[]
  plates: PlatePlacement[]
  plusSlots: PlusPlacement[]
  decor: DecorPlacement[]
  /** Solid footprint of the bookcase wall (for collision). */
  colliders: AABB[]
  /** Things that block the interaction ray (none with a single wall; kept for the picking code). */
  occluders: AABB[]
  boardsUsed: number
}

export interface LayoutOptions {
  authoring: boolean
  /** Overrides for tests. */
  room?: Partial<typeof config.room>
  bookcase?: Partial<typeof config.bookcase>
}

const BC = config.bookcase
const BK = config.book

export function bookSize(book: Pick<Book, 'id' | 'bytes' | 'format'>): { thickness: number; height: number; depth: number } {
  const height = BK.minHeight + (BK.maxHeight - BK.minHeight) * hash01(book.id, 'h')
  const depth = BK.minDepth + (BK.maxDepth - BK.minDepth) * hash01(book.id, 'd')
  if (book.format === 'url') return { thickness: BK.websiteThickness, height: Math.min(height, 0.26), depth }
  const lo = Math.log(10_000)
  const f = Math.min(1, Math.max(0, (Math.log(Math.max(book.bytes, 1)) - lo) / (Math.log(BK.bytesForMax) - lo)))
  const jitter = 0.9 + 0.2 * hash01(book.id, 't')
  const thickness = Math.min(BK.maxThickness, Math.max(BK.minThickness, (BK.minThickness + (BK.maxThickness - BK.minThickness) * f) * jitter))
  return { thickness, height, depth }
}

export function spineColor(book: Pick<Book, 'id' | 'spineColor' | 'format'>): string {
  if (book.spineColor) return book.spineColor
  if (book.format === 'url') return BK.websiteColor
  return BK.palette[hashString(book.id) % BK.palette.length]!
}

/** Board centre heights, top to bottom (the order boards are filled in). */
export function boardHeights(levels: number = BC.levels, bc: { lowestBoard: number; levelSpacing: number } = BC): number[] {
  return Array.from({ length: levels }, (_, i) => bc.lowestBoard + (levels - 1 - i) * bc.levelSpacing)
}

/** Total bookcase height: cabinet, open boards, the top box row, top board. */
export function bookcaseHeight(bc: { lowestBoard: number; levelSpacing: number; levels: number } = BC): number {
  return bc.lowestBoard + bc.levels * bc.levelSpacing + 0.02
}

/**
 * Divider positions (local x, measured from the left frame) for one board. Staggered from row to row and
 * section to section so the wall reads as boxes of different sizes, like a walnut cubby system.
 */
export function dividersFor(section: number, level: number, inner: number): number[] {
  switch ((section * 2 + level * 3) % 4) {
    case 0:
      return [inner * 0.42]
    case 1:
      return []
    case 2:
      return [inner * 0.63]
    default:
      return [inner * 0.5]
  }
}

/** Compartment spans [x0, x1] (local, from the left frame) for one board. */
export function compartmentsFor(section: number, level: number, inner: number, divider: number): [number, number][] {
  const cuts = dividersFor(section, level, inner)
  const spans: [number, number][] = []
  let x = 0
  for (const c of cuts) {
    spans.push([x, c - divider / 2])
    x = c + divider / 2
  }
  spans.push([x, inner])
  return spans
}

/** World position of a point given in a frame's local coordinates. */
export function toWorld(f: Frame, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(f.rotY)
  const s = Math.sin(f.rotY)
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c }
}

/** Compartments the library needs if `widths` is the sequence of compartment widths, or Infinity if it doesn't fit. */
function fits(library: Library, authoring: boolean, widths: number[], plusW: number): number {
  let i = 0
  for (const shelf of library.shelves) {
    if (i >= widths.length) return Infinity
    let used = 0
    for (const b of shelf.books) {
      const w = bookSize(b).thickness + BK.gap
      while (used > 0 ? used + w > widths[i]! : w > widths[i]!) {
        i++
        used = 0
        if (i >= widths.length) return Infinity
      }
      used += w
    }
    if (authoring && used > 0 && used + plusW > widths[i]!) {
      i++
      if (i >= widths.length) return Infinity
    }
    i++
  }
  return i
}

const DECOR_WIDTH: Record<DecorKind, number> = { plant: 0.16, vase: 0.11, stack: 0.24, box: 0.18, candles: 0.12, globe: 0.17, frame: 0.17, basket: 0.26 }
const COMPOSITIONS: DecorKind[][] = [
  ['plant', 'stack'],
  ['vase', 'box', 'candles'],
  ['stack', 'globe'],
  ['frame', 'vase'],
  ['candles', 'plant', 'stack'],
  ['box', 'frame'],
  ['globe', 'vase'],
]
const TAIL_ITEMS: DecorKind[] = ['plant', 'vase', 'stack', 'candles', 'frame']
const CUBBY_ITEMS: DecorKind[][] = [['basket'], ['stack', 'box'], ['basket', 'stack'], ['plant', 'basket']]

export function layout(library: Library, opts: LayoutOptions): Layout {
  const room = { ...config.room, ...opts.room }
  const bc = { ...BC, ...opts.bookcase }
  const pitch = bc.boardWidth
  const inner = pitch - bc.sidePanel
  const levels = bc.levels

  // The wall spans the room; grow the room one section at a time until every book fits.
  const sectionsFor = (len: number) => Math.max(1, Math.floor((len - bc.sidePanel) / pitch))
  const widthsFor = (n: number) => {
    const w: number[] = []
    for (let s = 0; s < n; s++) for (let l = 0; l < levels; l++) for (const [a, b] of compartmentsFor(s, l, inner, bc.dividerThickness)) w.push(b - a)
    return w
  }
  let length = room.length
  while (fits(library, opts.authoring, widthsFor(sectionsFor(length)), bc.plusSlotWidth) === Infinity && length < room.maxLength) {
    length = Math.round((length + room.growStep) * 1000) / 1000
  }
  const n = sectionsFor(length)
  const hz = room.depth / 2
  const block = n * pitch + bc.sidePanel
  const z = -hz + bc.depth / 2
  const sections: SectionPlacement[] = Array.from({ length: n }, (_, i) => ({
    index: i,
    x: -block / 2 + bc.sidePanel / 2 + (i + 0.5) * pitch,
    z,
    rotY: 0,
    width: pitch,
    depth: bc.depth,
    height: bookcaseHeight(bc),
    cabinet: i % 3 === 1 ? 'cubbies' : 'doors',
  }))
  const colliders: AABB[] = [{ minX: -length / 2, maxX: length / 2, minZ: -hz, maxZ: -hz + bc.depth + 0.02 }]

  const heights = boardHeights(levels, bc)
  const boards: BoardInfo[] = []
  for (const s of sections) {
    for (let l = 0; l < levels; l++) {
      for (const [x0, x1] of compartmentsFor(s.index, l, inner, bc.dividerThickness)) boards.push({ index: boards.length, section: s.index, level: l, x0, x1 })
    }
  }

  const books: BookPlacement[] = []
  const plates: PlatePlacement[] = []
  const plusSlots: PlusPlacement[] = []
  const usedWidth = new Map<number, number>()
  const frontZ = bc.depth / 2 - 0.015
  const boardTop = (bi: number) => heights[boards[bi]!.level]! + bc.boardThickness / 2
  const width = (bi: number) => boards[bi]!.x1 - boards[bi]!.x0
  const place = (bi: number, leftX: number, w: number, h: number, d: number) => {
    const info = boards[bi]!
    const section = sections[info.section]!
    const p = toWorld(section, -inner / 2 + info.x0 + leftX + w / 2, frontZ - d / 2)
    return { x: p.x, z: p.z, rotY: section.rotY, y: boardTop(bi) + h / 2, width: w, height: h, depth: d }
  }

  let board = 0
  for (const shelf of library.shelves) {
    if (board >= boards.length) break // only reachable when maxLength caps growth
    boards[board]!.shelfId = shelf.id
    {
      const info = boards[board]!
      const section = sections[info.section]!
      const pw = Math.min(0.26, width(board) - 0.04)
      const ph = 0.065
      const p = toWorld(section, -inner / 2 + info.x0 + 0.02 + pw / 2, bc.depth / 2 + 0.006)
      plates.push({ shelfId: shelf.id, title: shelf.title, x: p.x, z: p.z, rotY: section.rotY, y: boardTop(board) - bc.boardThickness - ph / 2 + 0.012, width: pw, height: ph, depth: 0.01 })
    }
    let used = 0
    for (const book of shelf.books) {
      const size = bookSize(book)
      const w = size.thickness + BK.gap
      while (used > 0 ? used + w > width(board) : w > width(board)) {
        usedWidth.set(board, used)
        board++
        if (board >= boards.length) break
        boards[board]!.shelfId = shelf.id
        used = 0
      }
      if (board >= boards.length) break
      books.push({ bookId: book.id, shelfId: shelf.id, board, color: spineColor(book), website: book.format === 'url', ...place(board, used + BK.gap / 2, size.thickness, size.height, size.depth) })
      used += w
    }
    if (opts.authoring && board < boards.length) {
      if (used > 0 && used + bc.plusSlotWidth > width(board)) {
        usedWidth.set(board, used)
        board++
        if (board < boards.length) boards[board]!.shelfId = shelf.id
        used = 0
      }
      if (board < boards.length) {
        plusSlots.push({ shelfId: shelf.id, board, ...place(board, used + 0.004, bc.plusSlotWidth - 0.008, 0.24, 0.18) })
        used += bc.plusSlotWidth
      }
    }
    if (board < boards.length) usedWidth.set(board, used)
    board++
  }
  const boardsUsed = Math.min(board, boards.length)

  // Cozy bits: something in every empty compartment and cubby, one item in a wide gap after a shelf.
  const decor: DecorPlacement[] = []
  const putDecor = (section: SectionPlacement, bi: number, y: number, kind: DecorKind, leftLocal: number, seed: number) => {
    const w = DECOR_WIDTH[kind]
    const p = toWorld(section, -inner / 2 + leftLocal + w / 2, frontZ - 0.11)
    decor.push({ kind, x: p.x, z: p.z, rotY: section.rotY, y, width: w, board: bi, seed })
  }
  const fill = (section: SectionPlacement, bi: number, y: number, x0: number, x1: number, choices: DecorKind[][], rand: () => number) => {
    let items = choices[Math.floor(rand() * choices.length)]!
    // Drop items until the composition fits the box.
    while (items.length && items.reduce((s, k) => s + DECOR_WIDTH[k], 0) + 0.04 * (items.length + 1) > x1 - x0) items = items.slice(0, -1)
    if (!items.length) items = ['vase'] // the narrowest thing we have: no box stays bare
    const total = items.reduce((s, k) => s + DECOR_WIDTH[k], 0)
    const gap = Math.min(0.12, (x1 - x0 - total) / (items.length + 1))
    let x = x0 + gap + rand() * Math.max(0, x1 - x0 - total - gap * (items.length + 1))
    for (const k of items) {
      putDecor(section, bi, y, k, x, Math.floor(rand() * 1e9))
      x += DECOR_WIDTH[k] + gap
    }
  }
  for (const b of boards) {
    const rand = mulberry32(b.index * 7919 + 17)
    const section = sections[b.section]!
    const used = usedWidth.get(b.index)
    if (used === undefined) fill(section, b.index, boardTop(b.index), b.x0, b.x1, COMPOSITIONS, rand)
    else if (width(b.index) - used >= 0.3) {
      const k = TAIL_ITEMS[Math.floor(rand() * TAIL_ITEMS.length)]!
      putDecor(section, b.index, boardTop(b.index), k, b.x1 - DECOR_WIDTH[k] - 0.04, Math.floor(rand() * 1e9))
    }
  }
  for (const s of sections) {
    if (s.cabinet !== 'cubbies') continue
    const rand = mulberry32(s.index * 104729 + 3)
    for (const y of cubbyFloors(bc)) fill(s, -1, y, 0.02, inner - 0.02, CUBBY_ITEMS, rand)
  }

  return {
    room: { length, depth: room.depth, height: room.height, minX: -length / 2, maxX: length / 2, minZ: -hz, maxZ: hz },
    sections,
    boards,
    books,
    plates,
    plusSlots,
    decor,
    colliders,
    occluders: [],
    boardsUsed,
  }
}

/** Floor heights of the two open cubbies in a cubby cabinet. */
export function cubbyFloors(bc: { lowestBoard: number; boardThickness: number } = BC): number[] {
  const cabTop = bc.lowestBoard - bc.boardThickness / 2
  return [0.08, 0.08 + (cabTop - 0.08) / 2 + bc.boardThickness / 2]
}

/** XZ bounds of a placed box (for overlap tests). */
export function footprint(p: BoxPlacement): AABB {
  const c = Math.abs(Math.cos(p.rotY))
  const s = Math.abs(Math.sin(p.rotY))
  const hx = (p.width / 2) * c + (p.depth / 2) * s
  const hz = (p.width / 2) * s + (p.depth / 2) * c
  return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz }
}

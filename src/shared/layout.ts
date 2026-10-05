// Pure, deterministic layout: library → bookcase sections, boards, books, plates, "+" slots and shelf decor.
//
// The whole north wall is one bookcase: closed cabinets below, three open boards at comfortable heights
// (books sit between 1 m and ~2.1 m), sections left → right. If the library outgrows the wall, the room
// gets longer. Boards that hold no books (and wide gaps after a shelf's last book) get a few simple items.
//
// World frame: x along the long window wall (room centred on x = 0), z from the north wall (−depth/2)
// to the window wall (+depth/2), y up. A section's local +z points out of the bookcase into the room;
// local +x is the viewer's right when facing it, so "left → right" is +x.
import { config } from '../config'
import { hash01, hashString, mulberry32 } from './hash'
import type { Book, Library } from './types'

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

export type DecorKind = 'plant' | 'vase' | 'stack' | 'box' | 'candles' | 'globe' | 'frame'

export interface DecorPlacement extends Frame {
  kind: DecorKind
  /** Height of the board surface the item stands on. */
  y: number
  width: number
  board: number
  /** Deterministic per-item variation (colours, proportions). */
  seed: number
}

export interface BoardInfo {
  index: number
  section: number
  level: number
  shelfId?: string
}

export interface Layout {
  room: { length: number; depth: number; height: number; minX: number; maxX: number; minZ: number; maxZ: number }
  sections: SectionPlacement[]
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

/** Total bookcase height: cabinet, open boards, headroom above the top board, crown. */
export function bookcaseHeight(bc: { lowestBoard: number; levelSpacing: number; levels: number } = BC): number {
  return bc.lowestBoard + (bc.levels - 1) * bc.levelSpacing + 0.42
}

/** World position of a point given in a frame's local coordinates. */
export function toWorld(f: Frame, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(f.rotY)
  const s = Math.sin(f.rotY)
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c }
}

/** Boards the library needs, in order (the "+" slot included when authoring). */
function boardsNeeded(library: Library, authoring: boolean, inner: number, plusW: number): number {
  let total = 0
  for (const shelf of library.shelves) {
    let boards = 1
    let used = 0
    for (const b of shelf.books) {
      const w = bookSize(b).thickness + BK.gap
      if (used > 0 && used + w > inner) {
        boards++
        used = 0
      }
      used += w
    }
    if (authoring && used > 0 && used + plusW > inner) boards++
    total += boards
  }
  return total
}

const DECOR_WIDTH: Record<DecorKind, number> = { plant: 0.16, vase: 0.11, stack: 0.24, box: 0.18, candles: 0.12, globe: 0.17, frame: 0.17 }
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

export function layout(library: Library, opts: LayoutOptions): Layout {
  const room = { ...config.room, ...opts.room }
  const bc = { ...BC, ...opts.bookcase }
  const pitch = bc.boardWidth
  const inner = pitch - bc.sidePanel
  const needed = boardsNeeded(library, opts.authoring, inner, bc.plusSlotWidth)

  // The wall spans the room; grow the room one section at a time until every board fits.
  const sectionsFor = (len: number) => Math.max(1, Math.floor((len - bc.sidePanel) / pitch))
  let length = room.length
  while (sectionsFor(length) * bc.levels < needed && length < room.maxLength) length = Math.round((length + room.growStep) * 1000) / 1000
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
  }))
  const colliders: AABB[] = [{ minX: -length / 2, maxX: length / 2, minZ: -hz, maxZ: -hz + bc.depth + 0.03 }]

  // Boards in reading order: section by section, top to bottom.
  const heights = boardHeights(bc.levels, bc)
  const boards: BoardInfo[] = []
  for (const s of sections) for (let l = 0; l < bc.levels; l++) boards.push({ index: boards.length, section: s.index, level: l })

  const books: BookPlacement[] = []
  const plates: PlatePlacement[] = []
  const plusSlots: PlusPlacement[] = []
  const usedWidth = new Map<number, number>()
  const frontZ = bc.depth / 2 - 0.015
  const boardTop = (bi: number) => heights[boards[bi]!.level]! + bc.boardThickness / 2
  const place = (bi: number, leftX: number, w: number, h: number, d: number) => {
    const section = sections[boards[bi]!.section]!
    const p = toWorld(section, -inner / 2 + leftX + w / 2, frontZ - d / 2)
    return { x: p.x, z: p.z, rotY: section.rotY, y: boardTop(bi) + h / 2, width: w, height: h, depth: d }
  }

  let board = 0
  for (const shelf of library.shelves) {
    if (board >= boards.length) break // only reachable when maxLength caps growth
    boards[board]!.shelfId = shelf.id
    {
      const section = sections[boards[board]!.section]!
      const pw = 0.26
      const ph = 0.065
      const p = toWorld(section, -inner / 2 + 0.02 + pw / 2, bc.depth / 2 + 0.006)
      plates.push({ shelfId: shelf.id, title: shelf.title, x: p.x, z: p.z, rotY: section.rotY, y: boardTop(board) - bc.boardThickness - ph / 2 + 0.012, width: pw, height: ph, depth: 0.01 })
    }
    let used = 0
    for (const book of shelf.books) {
      const size = bookSize(book)
      if (used > 0 && used + size.thickness + BK.gap > inner) {
        usedWidth.set(board, used)
        board++
        if (board >= boards.length) break
        boards[board]!.shelfId = shelf.id
        used = 0
      }
      books.push({ bookId: book.id, shelfId: shelf.id, board, color: spineColor(book), website: book.format === 'url', ...place(board, used + BK.gap / 2, size.thickness, size.height, size.depth) })
      used += size.thickness + BK.gap
    }
    if (opts.authoring && board < boards.length) {
      if (used > 0 && used + bc.plusSlotWidth > inner) {
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

  // Cozy bits: a small composition on every empty board, one item in a wide gap after a shelf's last book.
  const decor: DecorPlacement[] = []
  const putDecor = (bi: number, kind: DecorKind, leftX: number, seed: number) => {
    const section = sections[boards[bi]!.section]!
    const w = DECOR_WIDTH[kind]
    const p = toWorld(section, -inner / 2 + leftX + w / 2, frontZ - 0.1)
    decor.push({ kind, x: p.x, z: p.z, rotY: section.rotY, y: boardTop(bi), width: w, board: bi, seed })
  }
  for (const b of boards) {
    const rand = mulberry32(b.index * 7919 + 17)
    const used = usedWidth.get(b.index)
    if (used === undefined) {
      const items = COMPOSITIONS[Math.floor(rand() * COMPOSITIONS.length)]!
      const total = items.reduce((s, k) => s + DECOR_WIDTH[k], 0)
      const gap = Math.min(0.14, (inner - total) / (items.length + 1))
      let x = 0.06 + rand() * Math.max(0, inner - total - gap * (items.length - 1) - 0.12)
      for (const k of items) {
        putDecor(b.index, k, x, Math.floor(rand() * 1e9))
        x += DECOR_WIDTH[k] + gap
      }
    } else if (inner - used >= 0.3) {
      const k = TAIL_ITEMS[Math.floor(rand() * TAIL_ITEMS.length)]!
      putDecor(b.index, k, inner - DECOR_WIDTH[k] - 0.04, Math.floor(rand() * 1e9))
    }
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

/** XZ bounds of a placed box (for overlap tests). */
export function footprint(p: BoxPlacement): AABB {
  const c = Math.abs(Math.cos(p.rotY))
  const s = Math.abs(Math.sin(p.rotY))
  const hx = (p.width / 2) * c + (p.depth / 2) * s
  const hz = (p.width / 2) * s + (p.depth / 2) * c
  return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz }
}

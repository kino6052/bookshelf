// Pure, deterministic layout: library → bookcase sections, boards, books, plates and "+" slots.
//
// World frame: x along the long window wall (room centred on x = 0), z from the north wall (−depth/2)
// to the window wall (+depth/2), y up. A section's local +z points out of the bookcase into the aisle;
// local +x is the viewer's right when facing it, so "left → right" is +x in every section.
import { config } from '../config'
import { hash01, hashString } from './hash'
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
  run: number
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

export interface BoardInfo {
  index: number
  section: number
  level: number
  shelfId?: string
}

export interface RunInfo {
  kind: 'wall' | 'stack'
  /** Outward normal (into the aisle). */
  nx: number
  nz: number
  sections: number
}

export interface Layout {
  room: { length: number; depth: number; height: number; minX: number; maxX: number; minZ: number; maxZ: number }
  runs: RunInfo[]
  sections: SectionPlacement[]
  boards: BoardInfo[]
  books: BookPlacement[]
  plates: PlatePlacement[]
  plusSlots: PlusPlacement[]
  /** Solid footprints of bookcase runs and stacks (for collision). */
  colliders: AABB[]
  /** Stack centre dividers (block the interaction ray between the two faces). */
  occluders: AABB[]
  stacks: AABB[]
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

export function boardHeights(levels = BC.levels): number[] {
  // Top to bottom, the order boards are filled in.
  return Array.from({ length: levels }, (_, i) => BC.lowestBoard + (levels - 1 - i) * BC.levelSpacing)
}

interface Run {
  kind: 'wall' | 'stack'
  /** Start point of the run's span (world), and its direction (local +x). */
  sx: number
  sz: number
  dx: number
  dz: number
  nx: number
  nz: number
  span: number
  align: 'start' | 'end' | 'center'
}

/** Most freestanding stacks that fit down the middle of a room of this length. */
function maxStacks(length: number, bc: typeof BC): number {
  const stackDepth = 2 * bc.depth
  const free = length - 2 * (bc.depth + bc.aisle)
  return free >= stackDepth ? Math.floor((free - stackDepth) / (stackDepth + bc.aisle)) + 1 : 0
}

function makeRuns(length: number, stackCount: number, o: Required<Pick<LayoutOptions, 'room' | 'bookcase'>>): { runs: Run[]; stacks: AABB[] } {
  const room = { ...config.room, ...o.room }
  const bc = { ...BC, ...o.bookcase }
  const hx = length / 2
  const hz = room.depth / 2
  const d = bc.depth
  const sideStart = -hz + d + 0.05
  const sideEnd = hz - room.windowClearance
  const runs: Run[] = [
    // West wall, facing +x, read south → north.
    { kind: 'wall', sx: -hx + d / 2, sz: sideEnd, dx: 0, dz: -1, nx: 1, nz: 0, span: sideEnd - sideStart, align: 'end' },
    // North wall, facing +z, read west → east.
    { kind: 'wall', sx: -hx + d, sz: -hz + d / 2, dx: 1, dz: 0, nx: 0, nz: 1, span: length - 2 * d, align: 'center' },
    // East wall, facing −x, read north → south.
    { kind: 'wall', sx: hx - d / 2, sz: sideStart, dx: 0, dz: 1, nx: -1, nz: 0, span: sideEnd - sideStart, align: 'start' },
  ]
  // Freestanding double-sided stacks down the middle, running north–south.
  const stackDepth = 2 * d
  const pitch = stackDepth + bc.aisle
  const count = Math.min(stackCount, maxStacks(length, bc))
  const stackLen = bc.stackSections * bc.boardWidth + bc.sidePanel
  const z0 = -hz + d + bc.aisle
  const used = count * stackDepth + Math.max(0, count - 1) * bc.aisle
  const x0 = -used / 2 + stackDepth / 2
  const stacks: AABB[] = []
  for (let i = 0; i < count; i++) {
    const cx = x0 + i * pitch
    stacks.push({ minX: cx - d, maxX: cx + d, minZ: z0, maxZ: z0 + stackLen })
    // West face (facing −x) reads north → south; east face (facing +x) reads south → north.
    runs.push({ kind: 'stack', sx: cx - d / 2, sz: z0, dx: 0, dz: 1, nx: -1, nz: 0, span: stackLen, align: 'start' })
    runs.push({ kind: 'stack', sx: cx + d / 2, sz: z0 + stackLen, dx: 0, dz: -1, nx: 1, nz: 0, span: stackLen, align: 'start' })
  }
  return { runs, stacks }
}

function sectionsOf(run: Run, bc: typeof BC) {
  const pitch = bc.boardWidth
  const n = Math.max(0, Math.floor((run.span - bc.sidePanel) / pitch))
  const block = n * pitch + bc.sidePanel
  const offset = run.align === 'end' ? run.span - block : run.align === 'center' ? (run.span - block) / 2 : 0
  const rotY = Math.atan2(run.nx, run.nz)
  const out: Frame[] = []
  for (let i = 0; i < n; i++) {
    const along = offset + bc.sidePanel / 2 + (i + 0.5) * pitch
    out.push({ x: run.sx + run.dx * along, z: run.sz + run.dz * along, rotY })
  }
  return out
}

/** Boards each shelf needs, in order (the "+" slot included when authoring). */
function boardsNeeded(library: Library, authoring: boolean, inner: number): number {
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
    if (authoring && used > 0 && used + BC.plusSlotWidth > inner) boards++
    total += boards
  }
  return total
}

/** World position of a point given in a frame's local coordinates. */
export function toWorld(f: Frame, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(f.rotY)
  const s = Math.sin(f.rotY)
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c }
}

export function layout(library: Library, opts: LayoutOptions): Layout {
  const room = { ...config.room, ...opts.room }
  const bc = { ...BC, ...opts.bookcase }
  const inner = bc.boardWidth - bc.sidePanel
  const needed = boardsNeeded(library, opts.authoring, inner)

  // Perimeter walls first, then stacks one at a time, then grow the room's length one stack pitch at a time.
  let length = room.length
  let stackCount = 0
  const build = () => {
    const b = makeRuns(length, stackCount, { room, bookcase: bc })
    return { built: b, frames: b.runs.map((r) => sectionsOf(r, bc)) }
  }
  let { built, frames } = build()
  const capacity = () => frames.reduce((n, f) => n + f.length, 0) * bc.levels
  const growStep = 2 * bc.depth + bc.aisle
  while (capacity() < needed && length < room.maxLength) {
    if (stackCount < maxStacks(length, bc)) stackCount++
    else length = Math.round((length + growStep) * 1000) / 1000
    ;({ built, frames } = build())
  }

  const sections: SectionPlacement[] = []
  const runInfo: RunInfo[] = []
  const colliders: AABB[] = []
  built.runs.forEach((run, ri) => {
    const fr = frames[ri]!
    runInfo.push({ kind: run.kind, nx: run.nx, nz: run.nz, sections: fr.length })
    for (let i = 0; i < fr.length; i++) {
      sections.push({ ...fr[i]!, run: ri, index: sections.length, width: bc.boardWidth, depth: bc.depth, height: bc.lowestBoard + (bc.levels - 1) * bc.levelSpacing + 0.4 })
    }
    if (run.kind === 'wall' && fr.length) {
      const first = fr[0]!
      const last = fr[fr.length - 1]!
      const half = bc.boardWidth / 2 + bc.sidePanel / 2
      colliders.push({
        minX: Math.min(first.x, last.x) - (run.dx ? half : bc.depth / 2),
        maxX: Math.max(first.x, last.x) + (run.dx ? half : bc.depth / 2),
        minZ: Math.min(first.z, last.z) - (run.dz ? half : bc.depth / 2),
        maxZ: Math.max(first.z, last.z) + (run.dz ? half : bc.depth / 2),
      })
    }
  })
  colliders.push(...built.stacks)
  const occluders = built.stacks.map((s) => {
    const cx = (s.minX + s.maxX) / 2
    return { minX: cx - 0.01, maxX: cx + 0.01, minZ: s.minZ, maxZ: s.maxZ }
  })

  // Boards in reading order: section by section, top to bottom.
  const heights = boardHeights(bc.levels)
  const boards: BoardInfo[] = []
  for (const s of sections) for (let l = 0; l < bc.levels; l++) boards.push({ index: boards.length, section: s.index, level: l })

  const books: BookPlacement[] = []
  const plates: PlatePlacement[] = []
  const plusSlots: PlusPlacement[] = []
  const frontZ = bc.depth / 2 - 0.015
  let board = 0
  const boardFrame = (bi: number) => {
    const info = boards[bi]!
    return { section: sections[info.section]!, y: heights[info.level]! + bc.boardThickness / 2 }
  }
  const place = (bi: number, leftX: number, w: number, h: number, d: number) => {
    const { section, y } = boardFrame(bi)
    const lx = -inner / 2 + leftX + w / 2
    const p = toWorld(section, lx, frontZ - d / 2)
    return { x: p.x, z: p.z, rotY: section.rotY, y: y + h / 2, width: w, height: h, depth: d }
  }

  for (const shelf of library.shelves) {
    if (board >= boards.length) break // only reachable when maxLength caps growth
    boards[board]!.shelfId = shelf.id
    {
      const { section, y } = boardFrame(board)
      const pw = 0.28
      const ph = 0.06
      const p = toWorld(section, -inner / 2 + 0.02 + pw / 2, bc.depth / 2 + 0.006)
      plates.push({ shelfId: shelf.id, title: shelf.title, x: p.x, z: p.z, rotY: section.rotY, y: y - bc.boardThickness - ph / 2 + 0.012, width: pw, height: ph, depth: 0.01 })
    }
    let used = 0
    for (const book of shelf.books) {
      const size = bookSize(book)
      if (used > 0 && used + size.thickness + BK.gap > inner) {
        board++
        if (board >= boards.length) break
        boards[board]!.shelfId = shelf.id
        used = 0
      }
      books.push({ bookId: book.id, shelfId: shelf.id, board, color: spineColor(book), website: book.format === 'url', ...place(board, used + BK.gap / 2, size.thickness, size.height, size.depth) })
      used += size.thickness + BK.gap
    }
    if (opts.authoring) {
      if (used > 0 && used + bc.plusSlotWidth > inner) {
        board++
        if (board < boards.length) boards[board]!.shelfId = shelf.id
        used = 0
      }
      if (board < boards.length) plusSlots.push({ shelfId: shelf.id, board, ...place(board, used + 0.004, bc.plusSlotWidth - 0.008, 0.24, 0.18) })
    }
    board++
  }

  return {
    room: { length, depth: room.depth, height: room.height, minX: -length / 2, maxX: length / 2, minZ: -room.depth / 2, maxZ: room.depth / 2 },
    runs: runInfo,
    sections,
    boards,
    books,
    plates,
    plusSlots,
    colliders,
    occluders,
    stacks: built.stacks,
    boardsUsed: Math.min(board, boards.length),
  }
}

/** The four XZ corners of a placed box (for overlap tests and colliders). */
export function footprint(p: BoxPlacement): AABB {
  const c = Math.abs(Math.cos(p.rotY))
  const s = Math.abs(Math.sin(p.rotY))
  const hx = (p.width / 2) * c + (p.depth / 2) * s
  const hz = (p.width / 2) * s + (p.depth / 2) * c
  return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz }
}

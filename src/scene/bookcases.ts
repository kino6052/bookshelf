// The bookcase wall (static, merged into one draw call): walnut boards and staggered dividers forming boxes,
// a thin black steel frame, open backs (the brick wall shows through), and walnut cabinets below that
// alternate between doors and open cubbies.
import * as THREE from 'three'
import { config } from '../config'
import { boardHeights, compartmentsFor, cubbyFloors, toWorld, type Layout, type SectionPlacement } from '../shared/layout'
import { mulberry32 } from '../shared/hash'
import { GeometryBuilder, flatMaterial, staticMesh } from './builder'
import { palette } from './palette'

const BC = config.bookcase
const STEEL = 0.025

function addSection(b: GeometryBuilder, s: SectionPlacement, first: boolean): void {
  const w = s.width
  const d = s.depth
  const h = s.height
  const inner = w - BC.sidePanel
  const rand = mulberry32(s.index * 31 + 7)
  const wood = () => palette.walnut[Math.floor(rand() * palette.walnut.length)]!
  const part = (lx: number, y: number, lz: number, sw: number, sh: number, sd: number, color: string) => {
    const p = toWorld(s, lx, lz)
    b.box(p.x, y, p.z, sw, sh, sd, color, s.rotY)
  }

  // Steel frame: front and back uprights at each section edge (the left edge only for the first section),
  // rails along the top and just under each board at the back.
  for (const edge of first ? [-w / 2, w / 2] : [w / 2]) {
    for (const lz of [d / 2 - STEEL / 2, -d / 2 + STEEL / 2]) part(edge, h / 2 + 0.01, lz, STEEL, h + 0.02, STEEL, palette.steel)
  }
  part(0, h + 0.005, d / 2 - STEEL / 2, w, STEEL, STEEL, palette.steel)
  part(0, h + 0.005, -d / 2 + STEEL / 2, w, STEEL, STEEL, palette.steel)

  // Walnut boards: three open levels plus the top board.
  const heights = boardHeights(BC.levels)
  const top = BC.lowestBoard + BC.levels * BC.levelSpacing
  for (const y of [top, ...heights]) part(0, y, 0, inner, BC.boardThickness, d - 0.01, wood())
  // Dividers between each board and the one above it.
  heights.forEach((y, level) => {
    const spans = compartmentsFor(s.index, level, inner, BC.dividerThickness)
    const hgt = BC.levelSpacing - BC.boardThickness
    for (let i = 1; i < spans.length; i++) {
      const cx = -inner / 2 + (spans[i - 1]![1] + spans[i]![0]) / 2
      part(cx, y + BC.boardThickness / 2 + hgt / 2, 0, BC.dividerThickness, hgt, d - 0.02, wood())
    }
  })

  // Cabinet below the lowest board.
  const cabTop = BC.lowestBoard - BC.boardThickness / 2
  const cabH = cabTop - 0.06
  part(0, 0.03, -0.02, inner, 0.06, d - 0.06, palette.steel) // recessed plinth
  part(0, 0.06 + cabH / 2, -d / 2 + 0.012, inner, cabH, 0.012, wood()) // back
  part(0, 0.075, 0, inner, 0.03, d - 0.02, wood()) // floor
  if (s.cabinet === 'doors') {
    const doorW = inner / 2 - 0.004
    const color = wood()
    for (const side of [-1, 1]) {
      part(side * (doorW / 2 + 0.002), 0.06 + cabH / 2 + 0.004, d / 2 - 0.012, doorW, cabH - 0.012, 0.022, color)
      part(side * 0.05, 0.06 + cabH * 0.62, d / 2 + 0.006, 0.014, 0.16, 0.016, palette.steel) // bar handles
    }
  } else {
    // Open cubbies: a middle shelf; the layout puts baskets and stacks in them.
    const [, mid] = cubbyFloors(BC)
    part(0, mid! - BC.boardThickness / 2, 0, inner, BC.boardThickness, d - 0.02, wood())
  }
}

export function buildBookcases(layout: Layout): THREE.Mesh {
  const b = new GeometryBuilder()
  layout.sections.forEach((s, i) => addSection(b, s, i === 0))
  const mesh = staticMesh(b.build(), flatMaterial())
  mesh.name = 'bookcases'
  return mesh
}

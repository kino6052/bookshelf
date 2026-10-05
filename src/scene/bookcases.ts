// The bookcase wall (static, merged into one draw call), in a clean flush "system furniture" style:
// thick white panels all in one front plane, a single top slab, handle-less cabinet doors with shadow gaps,
// and warm LED strips tucked under each board (a second, unlit mesh).
import * as THREE from 'three'
import { config } from '../config'
import { boardHeights, toWorld, type Layout, type SectionPlacement } from '../shared/layout'
import { GeometryBuilder, flatMaterial, staticMesh } from './builder'
import { palette } from './palette'

const BC = config.bookcase

function addSection(b: GeometryBuilder, led: GeometryBuilder, s: SectionPlacement, first: boolean): void {
  const w = s.width
  const d = s.depth
  const h = s.height
  const t = BC.sidePanel
  const part = (into: GeometryBuilder, lx: number, y: number, lz: number, sw: number, sh: number, sd: number, color: string) => {
    const p = toWorld(s, lx, lz)
    into.box(p.x, y, p.z, sw, sh, sd, color, s.rotY)
  }
  part(b, 0, h / 2, -d / 2 + 0.008, w, h, 0.016, palette.bookcaseBack) // back
  if (first) part(b, -w / 2, h / 2, 0, t, h, d, palette.bookcase) // left side (shared panels after that)
  part(b, w / 2, h / 2, 0, t, h, d, palette.bookcase)
  part(b, 0, h - BC.boardThickness / 2, 0, w + t, BC.boardThickness, d, palette.bookcase) // top slab

  // Cabinet below the lowest board: flush, handle-less doors separated by thin shadow gaps.
  const plinth = 0.07
  const cabTop = BC.lowestBoard - BC.boardThickness / 2
  part(b, 0, plinth / 2, -0.02, w, plinth, d - 0.04, palette.shadowGap)
  const doorW = (w - t) / 2 - 0.004
  const doorH = cabTop - plinth - 0.008
  for (const side of [-1, 1]) part(b, side * (doorW / 2 + 0.002), plinth + doorH / 2 + 0.002, d / 2 - 0.01, doorW, doorH, 0.02, palette.cabinetDoor)
  part(b, 0, plinth + doorH / 2, d / 2 - 0.022, w - t, doorH, 0.004, palette.shadowGap) // the gaps read dark

  // Boards (thick, flush with the sides) and an LED strip under the front of each board above a compartment.
  const heights = boardHeights(BC.levels)
  for (const y of heights) part(b, 0, y, 0, w - t, BC.boardThickness, d, palette.board)
  const ledUnder = [h - BC.boardThickness, ...heights.slice(0, -1).map((y) => y - BC.boardThickness / 2)]
  for (const y of ledUnder) part(led, 0, y - 0.005, d / 2 - 0.035, w - t - 0.06, 0.008, 0.014, palette.led)
}

export function buildBookcases(layout: Layout): THREE.Group {
  const b = new GeometryBuilder()
  const led = new GeometryBuilder()
  layout.sections.forEach((s, i) => addSection(b, led, s, i === 0))
  const group = new THREE.Group()
  group.name = 'bookcases'
  const mesh = staticMesh(b.build(), flatMaterial())
  mesh.name = 'bookcase-wall'
  const strips = staticMesh(led.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), { cast: false, receive: false })
  strips.name = 'led-strips'
  group.add(mesh, strips)
  return group
}

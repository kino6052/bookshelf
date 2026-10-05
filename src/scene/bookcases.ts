// The bookcase wall (static, merged into one draw call): closed cabinets below, three open boards above.
import * as THREE from 'three'
import { config } from '../config'
import { boardHeights, toWorld, type Layout, type SectionPlacement } from '../shared/layout'
import { GeometryBuilder, flatMaterial, staticMesh } from './builder'
import { palette } from './palette'

const BC = config.bookcase

function addSection(b: GeometryBuilder, s: SectionPlacement): void {
  const w = s.width
  const d = s.depth
  const h = s.height
  const part = (lx: number, y: number, lz: number, sw: number, sh: number, sd: number, color: string) => {
    const p = toWorld(s, lx, lz)
    b.box(p.x, y, p.z, sw, sh, sd, color, s.rotY)
  }
  part(0, h / 2, -d / 2 + 0.01, w, h, 0.02, palette.bookcaseBack) // back
  part(-w / 2, h / 2, 0, BC.sidePanel, h, d, palette.bookcase) // sides
  part(w / 2, h / 2, 0, BC.sidePanel, h, d, palette.bookcase)
  part(0, h - 0.025, 0.01, w + BC.sidePanel, 0.05, d + 0.02, palette.trim) // crown

  // Cabinet: two doors with small knobs, recessed kick plinth; its top is the lowest board.
  const cabTop = BC.lowestBoard - BC.boardThickness / 2
  part(0, 0.04, d / 2 - 0.03, w, 0.08, 0.02, palette.bookcaseBack)
  const doorW = (w - BC.sidePanel) / 2 - 0.006
  for (const side of [-1, 1]) {
    const cx = side * (doorW / 2 + 0.003)
    part(cx, 0.08 + (cabTop - 0.09) / 2, d / 2 - 0.004, doorW, cabTop - 0.1, 0.018, palette.cabinetDoor)
    part(side * 0.035, 0.08 + (cabTop - 0.09) * 0.72, d / 2 + 0.01, 0.018, 0.06, 0.016, palette.knob)
  }
  // Boards (the lowest one doubles as the cabinet top, with a slightly proud front lip).
  for (const y of boardHeights(BC.levels)) part(0, y, 0, w - BC.sidePanel, BC.boardThickness, d - 0.01, palette.board)
  part(0, BC.lowestBoard - 0.004, d / 2 - 0.005, w, BC.boardThickness + 0.008, 0.02, palette.trim)
}

export function buildBookcases(layout: Layout): THREE.Mesh {
  const b = new GeometryBuilder()
  for (const s of layout.sections) addSection(b, s)
  const mesh = staticMesh(b.build(), flatMaterial())
  mesh.name = 'bookcases'
  return mesh
}

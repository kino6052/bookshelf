// Bookcase sections (static, merged into one draw call) built from the layout.
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
  part(0, h - 0.02, 0.005, w + BC.sidePanel, 0.04, d + 0.01, palette.bookcase) // top
  const plinth = BC.lowestBoard - BC.boardThickness / 2
  part(0, plinth / 2, -0.01, w, plinth, d - 0.02, palette.bookcaseBack) // plinth
  part(0, 0.06, d / 2 - 0.012, w, 0.12, 0.02, palette.bookcase) // kick board
  for (const y of boardHeights(BC.levels)) part(0, y, 0, w - BC.sidePanel, BC.boardThickness, d - 0.01, palette.board)
}

export function buildBookcases(layout: Layout): THREE.Mesh {
  const b = new GeometryBuilder()
  for (const s of layout.sections) addSection(b, s)
  // A low divider caps the ends of freestanding stacks so they read as one piece of furniture.
  for (const st of layout.stacks) {
    const cx = (st.minX + st.maxX) / 2
    b.box(cx, (BC.lowestBoard + (BC.levels - 1) * BC.levelSpacing + 0.4) / 2, (st.minZ + st.maxZ) / 2, 0.02, BC.lowestBoard + (BC.levels - 1) * BC.levelSpacing + 0.4, st.maxZ - st.minZ, palette.bookcaseBack)
  }
  const mesh = staticMesh(b.build(), flatMaterial())
  mesh.name = 'bookcases'
  return mesh
}

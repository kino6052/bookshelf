// Simple, cozy shelf items (plants, vases, stacked books, candles, a globe, little frames, a box).
// All low-poly, merged into one mesh; placements come from the layout and are deterministic.
import * as THREE from 'three'
import { config } from '../config'
import { mulberry32 } from '../shared/hash'
import type { DecorPlacement } from '../shared/layout'
import { GeometryBuilder, flatMaterial, staticMesh } from './builder'
import { palette } from './palette'

const CYL = new THREE.CylinderGeometry(1, 1, 1, 8)
const TAPER = new THREE.CylinderGeometry(0.62, 1, 1, 7)
const ICO = new THREE.IcosahedronGeometry(1, 0)
const SPHERE = new THREE.IcosahedronGeometry(1, 1)
const CERAMICS = ['#a8b5a2', '#8fa3b0', '#c98f6b', '#efeae0', '#d8c9a8', '#6f8f86']

function item(b: GeometryBuilder, d: DecorPlacement): void {
  const rand = mulberry32(d.seed)
  const c = Math.cos(d.rotY)
  const s = Math.sin(d.rotY)
  // Local offsets: lx along the board, lz towards the room.
  const at = (lx: number, lz: number) => ({ x: d.x + lx * c + lz * s, z: d.z - lx * s + lz * c })
  const y0 = d.y
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!
  switch (d.kind) {
    case 'plant': {
      const p = at(0, 0)
      b.add(TAPER, { x: p.x, y: y0 + 0.05, z: p.z, sx: 0.055, sy: 0.1, sz: 0.055, rotX: Math.PI }, pick(['#efeae0', palette.pot, '#c98f6b']))
      b.add(ICO, { x: p.x, y: y0 + 0.16, z: p.z, sx: 0.085, sy: 0.09, sz: 0.085, rotY: rand() * 3 }, palette.leaf)
      b.add(ICO, { x: p.x + 0.03, y: y0 + 0.22, z: p.z - 0.01, sx: 0.05, sy: 0.06, sz: 0.05, rotY: rand() * 3 }, palette.leafDark)
      break
    }
    case 'vase': {
      const p = at(0, 0)
      const h = 0.16 + rand() * 0.08
      b.add(TAPER, { x: p.x, y: y0 + h / 2, z: p.z, sx: 0.045, sy: h, sz: 0.045 }, pick(CERAMICS))
      for (let i = 0; i < 3; i++) {
        const q = at((i - 1) * 0.015, (rand() - 0.5) * 0.02)
        b.add(CYL, { x: q.x, y: y0 + h + 0.04, z: q.z, sx: 0.003, sy: 0.1, sz: 0.003, rotZ: (i - 1) * 0.25 }, palette.leafDark)
      }
      break
    }
    case 'stack': {
      let y = y0
      const n = 3 + Math.floor(rand() * 2)
      for (let i = 0; i < n; i++) {
        const h = 0.028 + rand() * 0.02
        const p = at((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.02)
        b.box(p.x, y + h / 2, p.z, 0.2 + rand() * 0.04, h, 0.15 + rand() * 0.03, pick(config.book.palette), d.rotY + (rand() - 0.5) * 0.25)
        y += h
      }
      break
    }
    case 'box': {
      const p = at(0, 0)
      b.box(p.x, y0 + 0.045, p.z, 0.18, 0.09, 0.12, '#c8a57c', d.rotY)
      b.box(p.x, y0 + 0.094, p.z, 0.185, 0.012, 0.125, '#b8946a', d.rotY)
      break
    }
    case 'candles': {
      const dish = at(0, 0)
      b.add(CYL, { x: dish.x, y: y0 + 0.006, z: dish.z, sx: 0.06, sy: 0.012, sz: 0.06 }, '#d9d4c8')
      for (const [lx, h] of [[-0.022, 0.11], [0.024, 0.075]] as const) {
        const p = at(lx, 0)
        b.add(CYL, { x: p.x, y: y0 + 0.012 + h / 2, z: p.z, sx: 0.018, sy: h, sz: 0.018 }, '#f4efe2')
        b.add(CYL, { x: p.x, y: y0 + 0.012 + h + 0.006, z: p.z, sx: 0.002, sy: 0.012, sz: 0.002 }, '#3a342c')
      }
      break
    }
    case 'globe': {
      const p = at(0, 0)
      b.add(CYL, { x: p.x, y: y0 + 0.01, z: p.z, sx: 0.06, sy: 0.02, sz: 0.06 }, '#8a6a4f')
      b.add(CYL, { x: p.x, y: y0 + 0.07, z: p.z, sx: 0.008, sy: 0.12, sz: 0.008 }, '#8a6a4f')
      b.add(SPHERE, { x: p.x, y: y0 + 0.17, z: p.z, sx: 0.075, sy: 0.075, sz: 0.075, rotY: rand() * 6 }, '#6f93a8')
      break
    }
    case 'basket': {
      // A woven basket: tapered body with a darker rim.
      const p = at(0, 0.02)
      b.box(p.x, y0 + 0.07, p.z, 0.25, 0.14, 0.2, pick(['#c9a777', '#b8956a', '#d2b48a']), d.rotY)
      b.box(p.x, y0 + 0.145, p.z, 0.255, 0.014, 0.205, '#9c7a52', d.rotY)
      break
    }
    case 'frame': {
      // A small picture leaning against the back of the shelf.
      const p = at(0, -0.04)
      b.box(p.x, y0 + 0.1, p.z, 0.16, 0.2, 0.014, pick(['#efeae0', '#3a3d42', '#c8a57c']), d.rotY)
      const q = at(0, -0.032)
      b.box(q.x, y0 + 0.1, q.z, 0.12, 0.16, 0.004, pick(['#a8b5a2', '#d8c9a8', '#8fa3b0', '#c98f6b']), d.rotY)
      break
    }
  }
}

export function buildDecor(decor: readonly DecorPlacement[]): THREE.Mesh {
  const b = new GeometryBuilder()
  for (const d of decor) item(b, d)
  const mesh = staticMesh(b.build(), flatMaterial())
  mesh.name = 'shelf-decor'
  return mesh
}

// Minimal university-library furniture: two long reading tables with stools, a reading corner by the
// windows, a few potted plants. White / pale grey, low-poly, merged into one mesh, each piece with a collider.
import * as THREE from 'three'
import type { AABB, Layout } from '../shared/layout'
import { GeometryBuilder, flatMaterial, staticMesh } from './builder'
import { palette } from './palette'

export interface FurnitureBuild {
  mesh: THREE.Mesh
  colliders: AABB[]
}

const box = (x: number, z: number, w: number, d: number, pad = 0): AABB => ({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad })

export function buildFurniture(room: Layout['room']): FurnitureBuild {
  const b = new GeometryBuilder()
  const colliders: AABB[] = []
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 8)
  const ico = new THREE.IcosahedronGeometry(1, 0)

  const table = (cx: number, cz: number, w: number, d: number) => {
    const h = 0.75
    b.box(cx, h - 0.02, cz, w, 0.04, d, palette.furniture)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(cx + sx * (w / 2 - 0.08), (h - 0.04) / 2, cz + sz * (d / 2 - 0.08), 0.05, h - 0.04, 0.05, palette.furnitureDark)
    b.box(cx, 0.68, cz, w - 0.2, 0.06, 0.04, palette.furnitureDark) // apron
    colliders.push(box(cx, cz, w, d))
    // Stools along both long sides.
    const n = Math.max(2, Math.round(w / 0.75))
    for (let i = 0; i < n; i++) {
      const sx = cx - w / 2 + (w / n) * (i + 0.5)
      for (const side of [-1, 1]) {
        const sz = cz + side * (d / 2 + 0.32)
        b.add(cyl, { x: sx, y: 0.44, z: sz, sx: 0.17, sy: 0.04, sz: 0.17 }, palette.furniture)
        b.add(cyl, { x: sx, y: 0.21, z: sz, sx: 0.025, sy: 0.42, sz: 0.025 }, palette.furnitureDark)
        b.add(cyl, { x: sx, y: 0.015, z: sz, sx: 0.14, sy: 0.03, sz: 0.14 }, palette.furnitureDark)
        colliders.push(box(sx, sz, 0.3, 0.3))
      }
    }
  }

  const armchair = (cx: number, cz: number, rotY: number) => {
    const part = (lx: number, y: number, lz: number, w: number, h: number, d: number, color: string) => {
      const c = Math.cos(rotY)
      const s = Math.sin(rotY)
      b.box(cx + lx * c + lz * s, y, cz - lx * s + lz * c, w, h, d, color, rotY)
    }
    part(0, 0.22, 0, 0.72, 0.2, 0.7, palette.furniture) // base
    part(0, 0.36, 0.02, 0.6, 0.1, 0.62, palette.cushion) // seat
    part(0, 0.58, -0.3, 0.72, 0.56, 0.12, palette.furniture) // back
    part(-0.33, 0.45, 0, 0.08, 0.3, 0.7, palette.furniture) // arms
    part(0.33, 0.45, 0, 0.08, 0.3, 0.7, palette.furniture)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(sx * 0.3, 0.06, sz * 0.28, 0.04, 0.12, 0.04, palette.furnitureDark)
    colliders.push(box(cx, cz, 0.8, 0.8))
  }

  const plant = (cx: number, cz: number, scale = 1) => {
    b.add(cyl, { x: cx, y: 0.22 * scale, z: cz, sx: 0.2 * scale, sy: 0.44 * scale, sz: 0.2 * scale }, palette.pot)
    b.add(ico, { x: cx, y: 0.75 * scale, z: cz, sx: 0.36 * scale, sy: 0.42 * scale, sz: 0.36 * scale }, palette.leaf)
    b.add(ico, { x: cx + 0.12 * scale, y: 1.02 * scale, z: cz - 0.05 * scale, sx: 0.22 * scale, sy: 0.28 * scale, sz: 0.22 * scale, rotY: 0.6 }, palette.leafDark)
    b.add(ico, { x: cx - 0.1 * scale, y: 0.98 * scale, z: cz + 0.08 * scale, sx: 0.2 * scale, sy: 0.26 * scale, sz: 0.2 * scale, rotY: 1.3 }, palette.leaf)
    colliders.push(box(cx, cz, 0.5 * scale, 0.5 * scale))
  }

  // Two long reading tables by the windows, centred in the room; the reading corner at the east end.
  // One long reading table in the middle of the room, leaving the bay seat and the bookcase aisle open.
  table(-0.25, (room.minZ + room.maxZ) / 2 + 0.25, 2.2, 0.85)

  const ex = room.maxX
  armchair(ex - 1.25, room.maxZ - 0.6, Math.PI * 0.85)
  armchair(ex - 0.55, room.maxZ - 1.3, Math.PI * 0.62)
  // Low side table between the chairs.
  b.add(cyl, { x: ex - 0.45, y: 0.45, z: room.maxZ - 0.45, sx: 0.22, sy: 0.03, sz: 0.22 }, palette.furniture)
  b.add(cyl, { x: ex - 0.45, y: 0.22, z: room.maxZ - 0.45, sx: 0.04, sy: 0.44, sz: 0.04 }, palette.furnitureDark)
  colliders.push(box(ex - 0.45, room.maxZ - 0.45, 0.48, 0.48))

  plant(room.minX + 0.4, room.maxZ - 0.4, 1.0)
  plant(ex - 0.35, room.maxZ - 2.15, 0.85)

  const mesh = staticMesh(b.build(), flatMaterial())
  mesh.name = 'furniture'
  return { mesh, colliders }
}

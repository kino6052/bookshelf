// A few simple paintings for the side walls: framed, flat low-poly compositions (no image textures).
import * as THREE from 'three'
import type { Layout } from '../shared/layout'
import { GeometryBuilder, flatMaterial, staticMesh } from './builder'

type Painter = (shape: (pts: [number, number][], color: string, z?: number) => void, rect: (u0: number, v0: number, u1: number, v1: number, color: string, z?: number) => void) => void

const circle = (cx: number, cy: number, r: number, n = 14): [number, number][] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r])

// Compositions in unit space (u right, v up, 0..1).
const PAINTINGS: Painter[] = [
  // Hills at noon.
  (shape, rect) => {
    rect(0, 0, 1, 1, '#dfe8ec')
    shape(circle(0.74, 0.74, 0.09), '#f1d48a', 1)
    shape([[0, 0.25], [0.35, 0.62], [0.75, 0.3], [1, 0.45], [1, 0], [0, 0]], '#9fb99a', 2)
    shape([[0, 0], [0, 0.18], [0.45, 0.4], [1, 0.12], [1, 0]], '#7d9c76', 3)
  },
  // Quiet blocks.
  (_shape, rect) => {
    rect(0, 0, 1, 1, '#efe9dd')
    rect(0.08, 0.5, 0.58, 0.92, '#c98f6b', 1)
    rect(0.62, 0.5, 0.92, 0.92, '#d8c9a8', 1)
    rect(0.08, 0.08, 0.38, 0.46, '#8fa3b0', 1)
    rect(0.42, 0.08, 0.92, 0.46, '#efe1c0', 1)
  },
  // Sea and a sail.
  (shape, rect) => {
    rect(0, 0.45, 1, 1, '#e6ecef')
    rect(0, 0, 1, 0.45, '#8fa9b8', 1)
    rect(0, 0.36, 1, 0.45, '#a9bfc9', 2)
    shape([[0.45, 0.42], [0.58, 0.42], [0.52, 0.78]], '#f6f2ea', 3)
    shape([[0.43, 0.42], [0.6, 0.42], [0.57, 0.38], [0.46, 0.38]], '#6b5a4a', 3)
  },
  // Three circles.
  (shape, rect) => {
    rect(0, 0, 1, 1, '#f1ece2')
    shape(circle(0.36, 0.56, 0.22), '#a8b5a2', 1)
    shape(circle(0.62, 0.44, 0.18), '#c98f6b', 2)
    shape(circle(0.5, 0.72, 0.1), '#2f3e5c', 3)
  },
]

interface Hang {
  /** Wall: −1 = west (faces +x), +1 = east (faces −x). */
  wall: -1 | 1
  z: number
  y: number
  w: number
  h: number
  painting: number
}

export function buildPaintings(room: Layout['room']): THREE.Mesh {
  const b = new GeometryBuilder()
  const hangs: Hang[] = [
    { wall: -1, z: -1.15, y: 1.62, w: 1.0, h: 0.72, painting: 0 },
    { wall: -1, z: 0.65, y: 1.55, w: 0.56, h: 0.76, painting: 3 },
    { wall: 1, z: -1.05, y: 1.6, w: 0.9, h: 0.66, painting: 2 },
    { wall: 1, z: 0.55, y: 1.62, w: 0.6, h: 0.6, painting: 1 },
  ]
  for (const hg of hangs) {
    const xWall = hg.wall < 0 ? room.minX : room.maxX
    const inward = -hg.wall // +1 on the west wall
    const rotY = inward > 0 ? Math.PI / 2 : -Math.PI / 2
    // Local u runs along the wall to the viewer's right, v up; depth steps towards the room.
    const uDir = new THREE.Vector3(Math.sin(rotY + Math.PI / 2), 0, Math.cos(rotY + Math.PI / 2))
    const toWorld = (u: number, v: number, depth: number) => ({
      x: xWall + inward * depth + uDir.x * (u - 0.5) * hg.w,
      y: hg.y + (v - 0.5) * hg.h,
      z: hg.z + uDir.z * (u - 0.5) * hg.w,
    })
    // Frame and a thin shadow-gap mat.
    const c = toWorld(0.5, 0.5, 0.02)
    b.box(c.x, c.y, c.z, hg.w + 0.08, hg.h + 0.08, 0.035, '#e9e3d6', rotY)
    const m = toWorld(0.5, 0.5, 0.038)
    b.box(m.x, m.y, m.z, hg.w + 0.01, hg.h + 0.01, 0.004, '#cfc7b6', rotY)
    const layerDepth = (z = 0) => 0.041 + z * 0.0015
    const shape = (pts: [number, number][], color: string, z = 0) => {
      const s = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2((u - 0.5) * hg.w, (v - 0.5) * hg.h)))
      const g = new THREE.ShapeGeometry(s)
      const o = toWorld(0.5, 0.5, layerDepth(z))
      b.add(g, { x: o.x, y: o.y, z: o.z, rotY }, color)
      g.dispose()
    }
    const rect = (u0: number, v0: number, u1: number, v1: number, color: string, z = 0) =>
      shape([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], color, z)
    PAINTINGS[hg.painting % PAINTINGS.length]!(shape, rect)
  }
  const mesh = staticMesh(b.build(), flatMaterial(), { cast: false, receive: true })
  mesh.name = 'paintings'
  return mesh
}

// Room shell: floor, ceiling, three solid walls and the south window wall with thin mullions.
import * as THREE from 'three'
import { config } from '../config'
import type { AABB, Layout } from '../shared/layout'
import { GeometryBuilder, flatMaterial, staticMesh } from './builder'
import { palette } from './palette'

export interface RoomBuild {
  group: THREE.Group
  colliders: AABB[]
  /** Window openings on the south wall (x ranges), handy for screenshots and tests. */
  windows: { minX: number; maxX: number }[]
}

export function buildRoom(room: Layout['room'], glassMaterial: THREE.Material): RoomBuild {
  const L = room.length
  const D = room.depth
  const H = room.height
  const t = config.room.wallThickness
  const solid = new GeometryBuilder()
  const group = new THREE.Group()
  group.name = 'room'

  // Floor: big pale tiles with a faint alternating tone, so walking has a sense of scale.
  const tile = 1
  const nx = Math.ceil(L / tile)
  const nz = Math.ceil(D / tile)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = -L / 2 + i * tile
      const z0 = -D / 2 + j * tile
      const w = Math.min(tile, L / 2 - x0)
      const d = Math.min(tile, D / 2 - z0)
      solid.box(x0 + w / 2, -0.1, z0 + d / 2, w - 0.004, 0.2, d - 0.004, (i + j) % 2 ? palette.floor : palette.floorSeam)
    }
  }
  // Grout underlay so tile gaps never show the void.
  solid.box(0, -0.12, 0, L + 2 * t, 0.2, D + 2 * t, palette.floorSeam)

  // Ceiling and solid walls overlap at the seams to avoid light leaks.
  solid.box(0, H + 0.15, 0, L + 2 * t + 0.2, 0.3, D + 2 * t + 0.2, palette.ceiling)
  solid.box(0, H / 2, -D / 2 - t / 2, L + 2 * t, H + 0.6, t, palette.wall) // north
  solid.box(-L / 2 - t / 2, H / 2, 0, t, H + 0.6, D + 2 * t, palette.wall) // west
  solid.box(L / 2 + t / 2, H / 2, 0, t, H + 0.6, D + 2 * t, palette.wall) // east
  // Skirting boards.
  solid.box(0, 0.05, -D / 2 + 0.01, L, 0.1, 0.02, palette.trim)
  solid.box(-L / 2 + 0.01, 0.05, 0, 0.02, 0.1, D, palette.trim)
  solid.box(L / 2 - 0.01, 0.05, 0, 0.02, 0.1, D, palette.trim)

  // South wall: piers at the ends, a low sill, a header, and floor-to-ceiling glazing with thin mullions.
  const zS = D / 2 + t / 2
  const pier = 0.45
  const sill = 0.12
  const header = 0.35
  solid.box(-L / 2 + pier / 2 - t / 2, H / 2, zS, pier + t, H + 0.6, t, palette.wall)
  solid.box(L / 2 - pier / 2 + t / 2, H / 2, zS, pier + t, H + 0.6, t, palette.wall)
  solid.box(0, sill / 2 - 0.15, zS, L, sill + 0.3, t, palette.wall)
  solid.box(0, H - header / 2 + 0.15, zS, L, header + 0.3, t, palette.wall)
  const openMin = -L / 2 + pier
  const openMax = L / 2 - pier
  const span = openMax - openMin
  const panes = Math.max(2, Math.round(span / 1.25))
  const pw = span / panes
  const mull = 0.06
  const windows: RoomBuild['windows'] = []
  for (let i = 0; i <= panes; i++) {
    const x = openMin + i * pw
    if (i > 0 && i < panes) solid.box(x, sill + (H - header - sill) / 2, zS, mull, H - header - sill, 0.1, palette.mullion)
    if (i < panes) windows.push({ minX: x + (i === 0 ? 0 : mull / 2), maxX: x + pw - (i === panes - 1 ? 0 : mull / 2) })
  }
  // Transom bar and inner sill ledge.
  solid.box(0, 2.45, zS, span, 0.05, 0.08, palette.mullion)
  solid.box(0, sill + 0.01, D / 2 + 0.02, span, 0.02, 0.12, palette.trim)

  const mesh = staticMesh(solid.build(), flatMaterial())
  mesh.name = 'room-shell'
  group.add(mesh)

  // Frosted glass across the whole opening (see frosted.ts). It casts no shadow, so the sun patches stay.
  const glassH = H - header - sill
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(span + 0.1, glassH + 0.1), glassMaterial)
  glass.name = 'window-glass'
  // Behind every mullion, transom and ledge (their back faces are at zS + 0.05), still inside the wall opening.
  glass.position.set(0, sill + glassH / 2, zS + 0.07)
  glass.rotation.y = Math.PI
  glass.castShadow = false
  glass.receiveShadow = false
  glass.matrixAutoUpdate = false
  glass.updateMatrix()
  group.add(glass)

  const big = 2
  const colliders: AABB[] = [
    { minX: -L / 2 - big, maxX: L / 2 + big, minZ: -D / 2 - big, maxZ: -D / 2 }, // north
    { minX: -L / 2 - big, maxX: L / 2 + big, minZ: D / 2, maxZ: D / 2 + big }, // south (glass)
    { minX: -L / 2 - big, maxX: -L / 2, minZ: -D / 2 - big, maxZ: D / 2 + big }, // west
    { minX: L / 2, maxX: L / 2 + big, minZ: -D / 2 - big, maxZ: D / 2 + big }, // east
  ]
  return { group, colliders, windows }
}

/** Sun + sky fill. The shadow camera is fitted to the room so the window patches stay crisp. */
export function buildLights(room: Layout['room']): { group: THREE.Group; sun: THREE.DirectionalLight } {
  const group = new THREE.Group()
  group.name = 'lights'
  const hemi = new THREE.HemisphereLight('#eef4fb', '#ebe9e4', 3.1)
  hemi.layers.enableAll()
  group.add(hemi)

  const sun = new THREE.DirectionalLight('#fff3dc', 5.2)
  // From the south-west, fairly low, so light reaches deep across the floor.
  const dir = new THREE.Vector3(-0.42, 0.58, 0.7).normalize()
  sun.position.copy(dir.clone().multiplyScalar(30))
  sun.target.position.set(0, 0, 0)
  sun.castShadow = true
  sun.layers.enableAll()
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  fitShadowCamera(sun, room)
  group.add(sun, sun.target)
  return { group, sun }
}

export function fitShadowCamera(sun: THREE.DirectionalLight, room: Layout['room']): void {
  const cam = sun.shadow.camera
  const half = Math.max(room.length, room.depth) / 2 + 1.5
  cam.left = -half
  cam.right = half
  cam.top = half
  cam.bottom = -half
  cam.near = 1
  cam.far = 70
  cam.updateProjectionMatrix()
}

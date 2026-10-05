// Room shell: floor, ceiling, a brick north wall behind the bookcase, plain side walls, and a south wall of
// glazed spans around a central bay window with a cushioned seat.
import * as THREE from 'three'
import { config } from '../config'
import { mulberry32 } from '../shared/hash'
import type { AABB, Layout } from '../shared/layout'
import { GeometryBuilder, UNIT_BOX, flatMaterial, staticMesh } from './builder'
import { palette } from './palette'

export interface RoomBuild {
  group: THREE.Group
  colliders: AABB[]
  /** Window panes on the south wall either side of the bay (x ranges). */
  windows: { minX: number; maxX: number }[]
}

/** The bay window: an opening of ±half in the south wall, a front face of ±front, `depth` deep. */
export const BAY = { half: 1.3, front: 0.8, depth: 0.95, seat: 0.45, sill: 0.55, top: 2.5 }

function placeGlass(group: THREE.Group, material: THREE.Material, cx: number, cy: number, cz: number, w: number, h: number, rotY: number): void {
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material)
  glass.name = 'window-glass'
  glass.position.set(cx, cy, cz)
  glass.rotation.y = rotY
  glass.castShadow = false
  glass.receiveShadow = false
  glass.matrixAutoUpdate = false
  glass.updateMatrix()
  group.add(glass)
}

/** A prism with an XZ polygon footprint between y0 and y1. */
function prism(points: [number, number][], y0: number, y1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false })
  g.rotateX(Math.PI / 2)
  g.translate(0, y1, 0)
  return g
}

function brickWall(L: number, H: number, zFace: number): THREE.Mesh {
  const b = new GeometryBuilder()
  const rand = mulberry32(4242)
  const bw = 0.215
  const bh = 0.065
  const joint = 0.012
  let row = 0
  for (let y = joint; y + bh <= H + 0.05; y += bh + joint, row++) {
    const offset = row % 2 ? (bw + joint) / 2 : 0
    for (let x = -L / 2 - offset; x < L / 2; x += bw + joint) {
      const x0 = Math.max(-L / 2, x)
      const x1 = Math.min(L / 2, x + bw)
      if (x1 - x0 < 0.03) continue
      const c = new THREE.Color(palette.brick[Math.floor(rand() * palette.brick.length)]!).offsetHSL(0, 0, (rand() - 0.5) * 0.05)
      b.box((x0 + x1) / 2, y + bh / 2, zFace + 0.018 + rand() * 0.004, x1 - x0, bh, 0.036, c)
    }
  }
  const mesh = staticMesh(b.build(), flatMaterial())
  mesh.name = 'brick-wall'
  return mesh
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
  for (let i = 0; i < Math.ceil(L / tile); i++) {
    for (let j = 0; j < Math.ceil(D / tile); j++) {
      const x0 = -L / 2 + i * tile
      const z0 = -D / 2 + j * tile
      const w = Math.min(tile, L / 2 - x0)
      const d = Math.min(tile, D / 2 - z0)
      solid.box(x0 + w / 2, -0.1, z0 + d / 2, w - 0.004, 0.2, d - 0.004, (i + j) % 2 ? palette.floor : palette.floorSeam)
    }
  }
  solid.box(0, -0.12, BAY.depth / 2, L + 2 * t, 0.2, D + 2 * t + BAY.depth, palette.floorSeam) // grout underlay, bay included

  // Ceiling over room and bay; walls overlap at the seams to avoid light leaks.
  solid.box(0, H + 0.15, BAY.depth / 2, L + 2 * t + 0.2, 0.3, D + 2 * t + 0.2 + BAY.depth, palette.ceiling)
  solid.box(0, H / 2, -D / 2 - t / 2, L + 2 * t, H + 0.6, t, palette.mortar) // north (bricks in front)
  solid.box(-L / 2 - t / 2, H / 2, 0, t, H + 0.6, D + 2 * t, palette.wall) // west
  solid.box(L / 2 + t / 2, H / 2, 0, t, H + 0.6, D + 2 * t, palette.wall) // east
  solid.box(-L / 2 + 0.01, 0.05, 0, 0.02, 0.1, D, palette.trim) // skirting
  solid.box(L / 2 - 0.01, 0.05, 0, 0.02, 0.1, D, palette.trim)

  // South wall: end piers, a pier either side of the bay, sill and header strips, glazing with mullions.
  const zS = D / 2 + t / 2
  const pier = 0.45
  const bayPier = 0.22
  const sill = 0.12
  const header = 0.35
  const glassTop = H - header
  solid.box(-L / 2 + pier / 2 - t / 2, H / 2, zS, pier + t, H + 0.6, t, palette.wall)
  solid.box(L / 2 - pier / 2 + t / 2, H / 2, zS, pier + t, H + 0.6, t, palette.wall)
  for (const side of [-1, 1]) solid.box(side * (BAY.half + bayPier / 2), H / 2, zS, bayPier, H + 0.6, t, palette.wall)
  solid.box(0, sill / 2 - 0.15, zS, L, sill + 0.3, t, palette.wall)
  solid.box(0, glassTop + header / 2 + 0.15, zS, L, header + 0.3, t, palette.wall)
  solid.box(0, (BAY.top + glassTop) / 2, zS, 2 * BAY.half, glassTop - BAY.top + 0.01, t, palette.wall) // lintel over the bay
  const windows: RoomBuild['windows'] = []
  const mull = 0.06
  const spans: [number, number][] = [
    [-L / 2 + pier, -BAY.half - bayPier],
    [BAY.half + bayPier, L / 2 - pier],
  ]
  for (const [a, b] of spans) {
    const span = b - a
    if (span < 0.4) continue
    const panes = Math.max(1, Math.round(span / 1.1))
    const pw = span / panes
    for (let i = 0; i <= panes; i++) {
      const x = a + i * pw
      if (i > 0 && i < panes) solid.box(x, sill + (glassTop - sill) / 2, zS, mull, glassTop - sill, 0.1, palette.mullion)
      if (i < panes) windows.push({ minX: x + (i === 0 ? 0 : mull / 2), maxX: x + pw - (i === panes - 1 ? 0 : mull / 2) })
    }
    solid.box((a + b) / 2, 2.45, zS, span, 0.05, 0.08, palette.mullion) // transom
    solid.box((a + b) / 2, sill + 0.01, D / 2 + 0.02, span, 0.02, 0.12, palette.trim) // inner ledge
    // Frosted glass behind the mullions (see frosted.ts); it casts no shadow, so the sun patches stay.
    placeGlass(group, glassMaterial, (a + b) / 2, (sill + glassTop) / 2, zS + 0.07, span + 0.1, glassTop - sill + 0.1, Math.PI)
  }

  // Bay window: a trapezoid poking out of the middle of the south wall, with a built-in seat.
  const z0 = D / 2
  const z1 = D / 2 + BAY.depth
  const poly: [number, number][] = [[-BAY.half, z0], [-BAY.front, z1], [BAY.front, z1], [BAY.half, z0]]
  solid.add(prism(poly, 0, BAY.seat), { x: 0, y: 0, z: 0 }, palette.trim) // seat base
  solid.box(0, BAY.seat / 2, z0 + 0.012, 2 * BAY.half - 0.02, BAY.seat, 0.025, palette.cabinetDoor) // seat front panel
  const inset: [number, number][] = [[-BAY.half + 0.05, z0 + 0.03], [-BAY.front + 0.02, z1 - 0.06], [BAY.front - 0.02, z1 - 0.06], [BAY.half - 0.05, z0 + 0.03]]
  solid.add(prism(inset, BAY.seat, BAY.seat + 0.09), { x: 0, y: 0, z: 0 }, palette.fabric) // cushion
  solid.add(prism(poly, BAY.top, BAY.top + 0.12), { x: 0, y: 0, z: 0 }, palette.ceiling) // bay ceiling
  const rand = mulberry32(77)
  const pillows: [number, number, number][] = [[-0.55, z1 - 0.2, 0.25], [0.05, z1 - 0.18, -0.1], [0.62, z1 - 0.22, -0.3], [-1.0, z0 + 0.35, 0.9]]
  for (const [px, pz, ry] of pillows) {
    solid.add(UNIT_BOX, { x: px, y: BAY.seat + 0.09 + 0.17, z: pz, sx: 0.42, sy: 0.34, sz: 0.12, rotY: ry, rotX: -0.25 }, palette.pillows[Math.floor(rand() * palette.pillows.length)]!)
  }
  // Knee walls, window frames and glass along each of the three bay faces.
  for (let i = 0; i < 3; i++) {
    const [ax, az] = poly[i]!
    const [bx, bz] = poly[i + 1]!
    const len = Math.hypot(bx - ax, bz - az)
    const rotY = Math.atan2(-(bz - az), bx - ax) // local +x runs from a to b
    const nx = -(bz - az) / len // outward normal (away from the room)
    const nz = (bx - ax) / len
    const out = (o: number) => ({ x: (ax + bx) / 2 + nx * o, z: (az + bz) / 2 + nz * o })
    const k = out(0.06)
    solid.box(k.x, BAY.sill / 2, k.z, len + 0.12, BAY.sill, 0.12, palette.wall, rotY) // knee wall
    solid.box(k.x, BAY.top + 0.06, k.z, len + 0.12, 0.12, 0.12, palette.wall, rotY) // header
    const f = out(0.02)
    solid.box(f.x, BAY.sill + 0.02, f.z, len, 0.04, 0.08, palette.mullion, rotY) // bottom rail
    solid.box(f.x, BAY.top - 0.02, f.z, len, 0.04, 0.08, palette.mullion, rotY) // top rail
    for (const [ex, ez] of [poly[i]!, poly[i + 1]!]) solid.box(ex + nx * 0.02, (BAY.sill + BAY.top) / 2, ez + nz * 0.02, 0.07, BAY.top - BAY.sill, 0.07, palette.mullion, rotY)
    if (i === 1) solid.box(f.x, (BAY.sill + BAY.top) / 2, f.z, mull, BAY.top - BAY.sill, 0.08, palette.mullion, rotY)
    const g = out(0.07)
    placeGlass(group, glassMaterial, g.x, (BAY.sill + BAY.top) / 2, g.z, len + 0.06, BAY.top - BAY.sill + 0.06, rotY + Math.PI)
  }
  // Roman blind on the bay's front window, part-way down, in soft folds.
  const rbW = 2 * BAY.front - 0.1
  for (let k = 0; k < 4; k++) solid.add(UNIT_BOX, { x: 0, y: BAY.top - 0.08 - k * 0.11, z: z1 - 0.06, sx: rbW, sy: 0.11, sz: 0.02 + (k % 2) * 0.012, rotX: k % 2 ? 0.12 : -0.12 }, palette.fabric)

  const mesh = staticMesh(solid.build(), flatMaterial())
  mesh.name = 'room-shell'
  group.add(mesh, brickWall(L, H, -D / 2), buildBlinds(windows, D, glassTop, sill))

  const big = 2
  const colliders: AABB[] = [
    { minX: -L / 2 - big, maxX: L / 2 + big, minZ: -D / 2 - big, maxZ: -D / 2 }, // north
    { minX: -L / 2 - big, maxX: L / 2 + big, minZ: D / 2, maxZ: D / 2 + big }, // south (the bay seat sits behind this line)
    { minX: -L / 2 - big, maxX: -L / 2, minZ: -D / 2 - big, maxZ: D / 2 + big }, // west
    { minX: L / 2, maxX: L / 2 + big, minZ: -D / 2 - big, maxZ: D / 2 + big }, // east
  ]
  return { group, colliders, windows }
}

/**
 * Venetian blinds just inside each pane, lowered to different heights. The tilted slats let the sun through
 * in stripes, so the light lands on the floor, the bookcase and the walls as bands.
 */
function buildBlinds(windows: RoomBuild['windows'], depth: number, top: number, sill: number): THREE.Mesh {
  const b = new GeometryBuilder()
  const z = depth / 2 - 0.07
  // Chunky slats over the whole pane, from the head rail down to the sill, tilted open.
  windows.forEach((w) => {
    const width = w.maxX - w.minX - 0.02
    const cx = (w.minX + w.maxX) / 2
    const bottom = sill + 0.06
    b.box(cx, top - 0.045, z - 0.01, width + 0.02, 0.09, 0.1, palette.blind)
    for (let y = top - 0.13; y > bottom + 0.04; y -= 0.075) b.add(UNIT_BOX, { x: cx, y, z, sx: width, sy: 0.007, sz: 0.08, rotX: -0.5 }, palette.blind)
    b.box(cx, bottom, z, width, 0.035, 0.07, palette.blind)
  })
  const mesh = staticMesh(b.build(), flatMaterial(), { cast: true, receive: false })
  mesh.name = 'blinds'
  return mesh
}

/** Sun + sky fill. The shadow camera is fitted to the room so the window patches stay crisp. */
export function buildLights(room: Layout['room']): { group: THREE.Group; sun: THREE.DirectionalLight } {
  const group = new THREE.Group()
  group.name = 'lights'
  const hemi = new THREE.HemisphereLight('#eef4fb', '#ebe9e4', 3.1)
  hemi.layers.enableAll()
  group.add(hemi)

  const sun = new THREE.DirectionalLight('#fff3dc', 5.2)
  // Low afternoon sun from the south-west: through the blinds it stripes the floor, the bookcase and the east wall.
  const dir = new THREE.Vector3(-0.52, 0.41, 0.75).normalize()
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

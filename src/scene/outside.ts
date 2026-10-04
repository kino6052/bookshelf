// The garden beyond the windows: sky gradient, lawn, soft hills, swaying low-poly trees and slow clouds.
import * as THREE from 'three'
import { mulberry32 } from '../shared/hash'
import { GeometryBuilder, flatMaterial, staticMesh } from './builder'
import { palette } from './palette'

export interface Outside {
  group: THREE.Group
  update(dt: number, t: number): void
}

function skyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(600, 24, 12)
  const top = new THREE.Color(palette.skyTop)
  const horizon = new THREE.Color(palette.skyHorizon)
  const pos = geo.attributes.position!
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) / 600)
    c.copy(horizon).lerp(top, THREE.MathUtils.smoothstep(h, 0.08, 0.75))
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }))
  mesh.name = 'sky'
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  return mesh
}

/** Faceted lawn: a coarse grid with gentle noise, flat at the building so it meets the walls cleanly. */
function lawn(rand: () => number, roomHalfX: number, roomHalfZ: number): THREE.Mesh {
  const size = 260
  const seg = 52
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).toNonIndexed()
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position!
  const heights = new Map<string, number>()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const key = `${x.toFixed(2)},${z.toFixed(2)}`
    let h = heights.get(key)
    if (h === undefined) {
      const dist = Math.max(Math.abs(x) - roomHalfX, Math.abs(z) - roomHalfZ, 0)
      h = dist < 6 ? 0 : (rand() - 0.5) * Math.min(1.2, (dist - 6) * 0.08)
      heights.set(key, h)
    }
    pos.setY(i, h - 0.06)
  }
  const colors = new Float32Array(pos.count * 3)
  const a = new THREE.Color(palette.lawn)
  const b = new THREE.Color(palette.lawnDark)
  const c = new THREE.Color()
  for (let f = 0; f < pos.count / 3; f++) {
    c.copy(a).lerp(b, rand() * 0.6)
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f * 3 + k) * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mesh = staticMesh(geo, flatMaterial(), { cast: false, receive: true })
  mesh.name = 'lawn'
  return mesh
}

function hills(rand: () => number): THREE.Mesh {
  const b = new GeometryBuilder()
  const ico = new THREE.IcosahedronGeometry(1, 1)
  for (let i = 0; i < 16; i++) {
    const angle = -Math.PI * 0.05 + (i / 15) * Math.PI * 1.1 // mostly south (+z), wrapping round the sides
    const dist = 55 + rand() * 50
    const r = 18 + rand() * 22
    const far = dist > 85
    b.add(ico, { x: Math.cos(angle) * dist * 1.2, y: -r * 0.72, z: Math.sin(angle) * dist, sx: r * 1.6, sy: r, sz: r }, far ? palette.hillFar : palette.hill)
  }
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI + (i / 9) * Math.PI
    const dist = 70 + rand() * 40
    const r = 20 + rand() * 20
    b.add(ico, { x: Math.cos(angle) * dist, y: -r * 0.75, z: Math.sin(angle) * dist, sx: r * 1.5, sy: r, sz: r }, palette.hillFar)
  }
  const mesh = staticMesh(b.build(), flatMaterial({ fog: true }), { cast: false, receive: false })
  mesh.name = 'hills'
  return mesh
}

interface Tree {
  x: number
  z: number
  scale: number
  phase: number
}

export function buildOutside(roomHalfX: number, roomHalfZ: number, reducedMotion: boolean): Outside {
  const rand = mulberry32(20261004)
  const group = new THREE.Group()
  group.name = 'outside'
  group.add(skyDome(), lawn(rand, roomHalfX, roomHalfZ), hills(rand))

  // Trees: mostly in the garden south of the windows, a few along the sides.
  const trees: Tree[] = []
  let guard = 0
  while (trees.length < 46 && guard++ < 2000) {
    const south = trees.length < 34
    const x = (rand() - 0.5) * (south ? 90 : 120)
    const z = south ? roomHalfZ + 7 + rand() * 55 : (rand() - 0.5) * 120
    if (Math.abs(x) < roomHalfX + 5 && Math.abs(z) < roomHalfZ + 6) continue
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 5)) continue
    trees.push({ x, z, scale: 0.8 + rand() * 0.9, phase: rand() * Math.PI * 2 })
  }
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5)
  trunkGeo.translate(0, 1.1, 0)
  const crownGeo = new THREE.IcosahedronGeometry(1.5, 0)
  crownGeo.scale(1, 1.25, 1)
  crownGeo.translate(0, 1.6, 0) // pivot at the crown's base so sway bends from the trunk top
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: palette.trunk, flatShading: true }), trees.length)
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ flatShading: true }), trees.length)
  trunks.name = 'tree-trunks'
  crowns.name = 'tree-crowns'
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const col = new THREE.Color()
  trees.forEach((t, i) => {
    m.compose(p.set(t.x, 0, t.z), q.identity(), s.setScalar(t.scale))
    trunks.setMatrixAt(i, m)
    col.set(palette.crown).lerp(new THREE.Color(palette.crownLight), rand())
    crowns.setColorAt(i, col)
  })
  const e = new THREE.Euler()
  const setCrowns = (time: number) => {
    trees.forEach((t, i) => {
      const sway = reducedMotion ? 0 : Math.sin(time * 0.7 + t.phase) * 0.035
      e.set(sway, 0, sway * 0.6)
      m.compose(p.set(t.x, 2 * t.scale, t.z), q.setFromEuler(e), s.setScalar(t.scale))
      crowns.setMatrixAt(i, m)
    })
    crowns.instanceMatrix.needsUpdate = true
  }
  setCrowns(0)
  trunks.instanceMatrix.needsUpdate = true
  trunks.computeBoundingSphere()
  crowns.computeBoundingSphere()
  group.add(trunks, crowns)

  // Clouds: clusters of flattened puffs drifting slowly.
  const puffGeo = new THREE.IcosahedronGeometry(1, 0)
  const clouds: { x: number; y: number; z: number; puffs: { dx: number; dy: number; dz: number; r: number }[] }[] = []
  for (let c = 0; c < 9; c++) {
    const puffs = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({ dx: (rand() - 0.5) * 18, dy: rand() * 3, dz: (rand() - 0.5) * 7, r: 4 + rand() * 5 }))
    clouds.push({ x: (rand() - 0.5) * 400, y: 55 + rand() * 30, z: 40 + rand() * 220, puffs })
  }
  const puffCount = clouds.reduce((n, c) => n + c.puffs.length, 0)
  const cloudMesh = new THREE.InstancedMesh(puffGeo, new THREE.MeshLambertMaterial({ color: palette.cloud, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.35 }), puffCount)
  cloudMesh.name = 'clouds'
  cloudMesh.frustumCulled = false
  const setClouds = (time: number) => {
    let i = 0
    for (const c of clouds) {
      const x = ((c.x + time * 1.2 + 260) % 520) - 260
      for (const pf of c.puffs) {
        m.compose(p.set(x + pf.dx, c.y + pf.dy, c.z + pf.dz), q.identity(), s.set(pf.r * 1.6, pf.r * 0.55, pf.r))
        cloudMesh.setMatrixAt(i++, m)
      }
    }
    cloudMesh.instanceMatrix.needsUpdate = true
  }
  setClouds(0)
  group.add(cloudMesh)

  let acc = 0
  return {
    group,
    update(dt, t) {
      if (reducedMotion) return
      acc += dt
      if (acc < 1 / 30) return // 30 Hz is plenty for sway
      acc = 0
      setCrowns(t)
      setClouds(t)
    },
  }
}

// Accumulates low-poly primitives with per-vertex colours into one merged geometry (one draw call).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const tmpMatrix = new THREE.Matrix4()
const tmpQuat = new THREE.Quaternion()
const tmpEuler = new THREE.Euler()
const tmpColor = new THREE.Color()

export interface Placement {
  x: number
  y: number
  z: number
  rotY?: number
  rotX?: number
  rotZ?: number
  sx?: number
  sy?: number
  sz?: number
}

export class GeometryBuilder {
  private parts: THREE.BufferGeometry[] = []

  add(geo: THREE.BufferGeometry, p: Placement, color: THREE.ColorRepresentation): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    // Keep only what every part shares so mergeGeometries never trips on mismatched attributes.
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    tmpEuler.set(p.rotX ?? 0, p.rotY ?? 0, p.rotZ ?? 0, 'YXZ')
    tmpQuat.setFromEuler(tmpEuler)
    tmpMatrix.compose(new THREE.Vector3(p.x, p.y, p.z), tmpQuat, new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1))
    g.applyMatrix4(tmpMatrix)
    tmpColor.set(color)
    const n = g.attributes.position!.count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      colors[i * 3] = tmpColor.r
      colors[i * 3 + 1] = tmpColor.g
      colors[i * 3 + 2] = tmpColor.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.parts.push(g)
    return this
  }

  /** Axis-aligned (before rotY) box given by its centre and size. */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, rotY = 0): this {
    return this.add(UNIT_BOX, { x: cx, y: cy, z: cz, sx: w, sy: h, sz: d, rotY }, color)
  }

  get size(): number {
    return this.parts.length
  }

  build(): THREE.BufferGeometry {
    const merged = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry()
    for (const p of this.parts) p.dispose()
    this.parts = []
    merged.computeBoundingSphere()
    merged.computeBoundingBox()
    return merged
  }
}

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)

/** Flat-shaded, vertex-coloured Lambert: the house material for everything static. */
export function flatMaterial(extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  // Polygon offset pushes faces back a hair so the comic outlines on their edges always win the depth test.
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...extra })
}

export function staticMesh(geo: THREE.BufferGeometry, material: THREE.Material, shadows: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material)
  mesh.castShadow = shadows.cast ?? true
  mesh.receiveShadow = shadows.receive ?? true
  mesh.matrixAutoUpdate = false
  mesh.updateMatrix()
  return mesh
}

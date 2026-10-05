// Comic-book outlines: thick, screen-space black lines along the real edges of objects (EdgesGeometry →
// LineSegments2). No post-processing pass; one extra draw call per outlined mesh.
import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'

/** Ink for most edges; a thinner, browner line for busy surfaces like the brick wall. */
export const inkMaterial = new LineMaterial({ color: '#1d1b19', linewidth: 1.7 })
export const fineInkMaterial = new LineMaterial({ color: '#4a2c22', linewidth: 1.0 })
const materials = [inkMaterial, fineInkMaterial]

/** Line widths are in CSS pixels, so this takes the canvas size in CSS pixels. */
export function setOutlineResolution(width: number, height: number): void {
  for (const m of materials) m.resolution.set(width, height)
}

/** Creases sharper than `thresholdDeg` (and all silhouettes of closed boxes) become lines. */
export function outline(mesh: THREE.Mesh, opts: { thresholdDeg?: number; fine?: boolean } = {}): LineSegments2 {
  const edges = new THREE.EdgesGeometry(mesh.geometry, opts.thresholdDeg ?? 30)
  const geo = new LineSegmentsGeometry().setPositions(edges.attributes.position!.array as Float32Array)
  edges.dispose()
  const line = new LineSegments2(geo, opts.fine ? fineInkMaterial : inkMaterial)
  line.name = `${mesh.name || 'mesh'}-outline`
  line.matrixAutoUpdate = mesh.matrixAutoUpdate
  if (!mesh.matrixAutoUpdate) line.matrix.copy(mesh.matrix)
  line.layers.mask = mesh.layers.mask
  return line
}

/** Outlines every mesh under `root` (as siblings in a returned group, matrices copied). */
export function outlineAll(root: THREE.Object3D, skip: (m: THREE.Mesh) => boolean = () => false, fine: (m: THREE.Mesh) => boolean = () => false): THREE.Group {
  const group = new THREE.Group()
  group.name = 'outlines'
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || skip(m)) return
    const line = outline(m, { fine: fine(m) })
    line.matrixAutoUpdate = false
    line.matrix.copy(m.matrixWorld)
    group.add(line)
  })
  return group
}

const corners = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
] as const
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const

/** The 12 edges of oriented boxes (yaw only) as a flat segment list, for instanced things like books. */
export function boxEdgePositions(boxes: readonly { x: number; y: number; z: number; rotY: number; width: number; height: number; depth: number }[]): Float32Array {
  const out = new Float32Array(boxes.length * 12 * 6)
  let o = 0
  const v = new THREE.Vector3()
  for (const b of boxes) {
    const c = Math.cos(b.rotY)
    const s = Math.sin(b.rotY)
    const pts = corners.map(([cx, cy, cz]) => {
      const lx = (cx * b.width) / 2
      const lz = (cz * b.depth) / 2
      return v.set(b.x + lx * c + lz * s, b.y + (cy * b.height) / 2, b.z - lx * s + lz * c).toArray()
    })
    for (const [a, z] of EDGES) {
      out.set(pts[a]!, o)
      out.set(pts[z]!, o + 3)
      o += 6
    }
  }
  return out
}

export function segmentsLine(positions: Float32Array, name: string): LineSegments2 {
  const geo = new LineSegmentsGeometry().setPositions(positions.length ? positions : new Float32Array(6))
  const line = new LineSegments2(geo, inkMaterial)
  line.name = name
  line.frustumCulled = false
  return line
}

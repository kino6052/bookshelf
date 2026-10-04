// One interaction ray for every input: screen centre (pointer lock), cursor (unlocked) or touch point.
import * as THREE from 'three'
import { config } from '../config'
import type { AABB } from '../shared/layout'
import type { BookHit, BookShelves } from './books'

export type RaySource = { kind: 'center' } | { kind: 'point'; x: number; y: number }

const OCCLUDER_HEIGHT = 2.6

/** Ray vs XZ box extruded from y=0 to `height`; returns the entry distance or Infinity. */
export function rayBoxDistance(origin: THREE.Vector3, dir: THREE.Vector3, b: AABB, height = OCCLUDER_HEIGHT): number {
  let tmin = 0
  let tmax = Infinity
  const axes: [number, number, number, number][] = [
    [origin.x, dir.x, b.minX, b.maxX],
    [origin.y, dir.y, 0, height],
    [origin.z, dir.z, b.minZ, b.maxZ],
  ]
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity
      continue
    }
    let t1 = (lo - o) / d
    let t2 = (hi - o) / d
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return Infinity
  }
  return tmin
}

export class Interaction {
  readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  occluders: AABB[] = []

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly shelves: BookShelves,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.raycaster.far = config.player.reach
  }

  /** Picks the nearest book or "+" slot within reach that isn't hidden behind a stack divider. */
  pick(source: RaySource): BookHit | undefined {
    if (source.kind === 'center') this.ndc.set(0, 0)
    else {
      const r = this.canvas.getBoundingClientRect()
      this.ndc.set(((source.x - r.left) / r.width) * 2 - 1, -((source.y - r.top) / r.height) * 2 + 1)
    }
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.ndc, this.camera)
    this.raycaster.far = config.player.reach
    const hit = this.shelves.raycast(this.raycaster)
    if (!hit) return undefined
    const { origin, direction } = this.raycaster.ray
    for (const o of this.occluders) if (rayBoxDistance(origin, direction, o) < hit.distance - 0.01) return undefined
    return hit
  }
}

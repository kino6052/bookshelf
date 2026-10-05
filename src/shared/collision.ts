// Circle-vs-AABB collision in the XZ plane, with sliding. No physics engine.
import type { AABB } from './layout.ts'

/** Pushes a circle out of every box it overlaps. A few passes settle corners where two boxes meet. */
export function resolveCircle(x: number, z: number, r: number, boxes: readonly AABB[], passes = 4): { x: number; z: number } {
  for (let pass = 0; pass < passes; pass++) {
    let moved = false
    for (const b of boxes) {
      if (x + r <= b.minX || x - r >= b.maxX || z + r <= b.minZ || z - r >= b.maxZ) continue
      const cx = Math.min(Math.max(x, b.minX), b.maxX)
      const cz = Math.min(Math.max(z, b.minZ), b.maxZ)
      const dx = x - cx
      const dz = z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2)
        const push = (r - d) / d
        x += dx * push
        z += dz * push
      } else {
        // Centre inside the box: leave along the shallowest axis.
        const left = x - b.minX + r
        const right = b.maxX - x + r
        const near = z - b.minZ + r
        const far = b.maxZ - z + r
        const m = Math.min(left, right, near, far)
        if (m === left) x = b.minX - r
        else if (m === right) x = b.maxX + r
        else if (m === near) z = b.minZ - r
        else z = b.maxZ + r
      }
      moved = true
    }
    if (!moved) break
  }
  return { x, z }
}

/**
 * Moves a circle by (dx, dz), sub-stepping so a fast step can't tunnel through thin boxes.
 * Sliding falls out of resolving penetration after each sub-step.
 */
export function moveCircle(x: number, z: number, dx: number, dz: number, r: number, boxes: readonly AABB[]): { x: number; z: number } {
  const dist = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(dist / (r * 0.5)))
  let p = { x, z }
  for (let i = 0; i < steps; i++) p = resolveCircle(p.x + dx / steps, p.z + dz / steps, r, boxes)
  return p
}

/** Minimum distance between a circle's centre and a box (negative = centre inside). */
export function distanceToBox(x: number, z: number, b: AABB): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX)
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ)
  if (dx === 0 && dz === 0) return -Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z)
  return Math.hypot(dx, dz)
}

export function overlapsAny(x: number, z: number, r: number, boxes: readonly AABB[]): boolean {
  return boxes.some((b) => distanceToBox(x, z, b) < r - 1e-6)
}

/**
 * Nearest position to (x, z) where a circle of radius r overlaps nothing: push-out first, then a ring
 * search for spots push-out can't reach (e.g. dropped between a stool and a table that are closer than 2r).
 */
export function findFreeSpot(x: number, z: number, r: number, boxes: readonly AABB[]): { x: number; z: number } {
  const p = resolveCircle(x, z, r, boxes, 8)
  if (!overlapsAny(p.x, p.z, r, boxes)) return p
  for (let ring = 1; ring <= 40; ring++) {
    const rad = ring * 0.1
    const steps = 8 + ring * 4
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const cx = x + Math.cos(a) * rad
      const cz = z + Math.sin(a) * rad
      if (!overlapsAny(cx, cz, r, boxes)) return { x: cx, z: cz }
    }
  }
  return p
}

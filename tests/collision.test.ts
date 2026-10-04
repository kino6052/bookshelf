import { describe, expect, it } from 'vitest'
import { distanceToBox, moveCircle } from '../src/shared/collision'
import type { AABB } from '../src/shared/layout'

const wall: AABB = { minX: -10, maxX: 10, minZ: -1.2, maxZ: -1 }
const box: AABB = { minX: 1, maxX: 2, minZ: 1, maxZ: 2 }
const R = 0.3

describe('moveCircle', () => {
  it('stops at a wall without penetrating', () => {
    let p = { x: 0, z: 0 }
    for (let i = 0; i < 100; i++) p = moveCircle(p.x, p.z, 0, -0.05, R, [wall])
    expect(distanceToBox(p.x, p.z, wall)).toBeGreaterThanOrEqual(R - 1e-9)
    expect(p.z).toBeCloseTo(-1 + R, 6)
  })

  it('slides along a wall when walking diagonally into it', () => {
    let p = { x: 0, z: -0.69 }
    for (let i = 0; i < 20; i++) p = moveCircle(p.x, p.z, 0.05, -0.05, R, [wall])
    expect(p.x).toBeGreaterThan(0.9)
    expect(p.z).toBeCloseTo(-0.7, 6)
  })

  it('never tunnels through a thin box with a huge step', () => {
    const thin: AABB = { minX: -5, maxX: 5, minZ: 0, maxZ: 0.02 }
    const p = moveCircle(0, -1, 0, 3, R, [thin])
    expect(p.z).toBeLessThan(0)
    expect(distanceToBox(p.x, p.z, thin)).toBeGreaterThanOrEqual(R - 1e-9)
  })

  it('rounds corners and settles in an inside corner', () => {
    const a: AABB = { minX: -5, maxX: 0, minZ: -5, maxZ: -4 }
    const b: AABB = { minX: -5, maxX: -4, minZ: -5, maxZ: 0 }
    let p = { x: -3, z: -3 }
    for (let i = 0; i < 100; i++) p = moveCircle(p.x, p.z, -0.05, -0.05, R, [a, b])
    expect(p.x).toBeCloseTo(-4 + R, 5)
    expect(p.z).toBeCloseTo(-4 + R, 5)
    const q = moveCircle(0.5, 1.5, 1, 0, R, [box])
    expect(distanceToBox(q.x, q.z, box)).toBeGreaterThanOrEqual(R - 1e-9)
  })
})

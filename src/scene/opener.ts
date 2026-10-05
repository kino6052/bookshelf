// Pull-out / open / return animation. State machine: idle → pulling → reading → returning → idle.
// The instanced book is hidden while a standalone, more detailed mesh does the travelling.
import * as THREE from 'three'
import { outline } from './outlines'
import { palette } from './palette'
import type { BookShelves } from './books'
import type { BookPlacement } from '../shared/layout'

export type OpenState = 'idle' | 'pulling' | 'reading' | 'returning'

const DURATION = 0.7
const HINGE_OPEN = -THREE.MathUtils.degToRad(155)

interface Pose {
  pos: THREE.Vector3
  quat: THREE.Quaternion
}

export class BookOpener {
  state: OpenState = 'idle'
  bookId: string | undefined
  /** 0 = on the shelf, 1 = open in front of the camera. */
  private t = 0
  private mesh: THREE.Group | undefined
  private cover: THREE.Group | undefined
  private placement: BookPlacement | undefined
  private readonly duration: number
  onStateChange?: (state: OpenState, bookId: string | undefined) => void

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly shelves: BookShelves,
    reducedMotion: boolean,
  ) {
    this.duration = reducedMotion ? 0.05 : DURATION
  }

  /** Starts opening. Ignored unless idle (rapid clicks can't stack animations). */
  open(id: string): boolean {
    if (this.state !== 'idle') return false
    const p = this.shelves.placementOf(id)
    if (!p) return false
    this.bookId = id
    this.placement = p
    this.t = 0
    this.buildMesh(p)
    this.shelves.setHidden(id, true)
    this.setState('pulling')
    return true
  }

  /** Closing works from any state: mid-pull it simply reverses from where it is. */
  close(): void {
    if (this.state === 'pulling' || this.state === 'reading') this.setState('returning')
  }

  update(dt: number): void {
    if (this.state === 'idle' || this.state === 'reading' || !this.mesh) return
    const step = dt / this.duration
    if (this.state === 'pulling') {
      this.t = Math.min(1, this.t + step)
      if (this.t >= 1) this.setState('reading')
    } else if (this.state === 'returning') {
      // Re-target in case the library changed while reading.
      const p = this.bookId ? this.shelves.placementOf(this.bookId) : undefined
      if (p) this.placement = p
      this.t = Math.max(0, this.t - step)
      if (!p) this.mesh.scale.setScalar(Math.max(0.001, this.t)) // removed while open: shrink away
      if (this.t <= 0) {
        this.finish(!!p)
        return
      }
    }
    this.apply()
  }

  /** Keeps the open book in front of the camera while reading (the camera may be nudged by resize). */
  follow(): void {
    if (this.state === 'reading') this.apply()
  }

  private finish(showInstance: boolean): void {
    if (this.bookId && showInstance) this.shelves.setHidden(this.bookId, false)
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        ;(m.material as THREE.Material | undefined)?.dispose()
      })
    }
    this.mesh = undefined
    this.cover = undefined
    const id = this.bookId
    this.bookId = undefined
    this.placement = undefined
    this.setState('idle', id)
  }

  private setState(s: OpenState, id = this.bookId): void {
    this.state = s
    this.onStateChange?.(s, id)
  }

  private buildMesh(p: BookPlacement): void {
    const w = p.width
    const hgt = p.height
    const d = p.depth
    const coverMat = new THREE.MeshLambertMaterial({ color: p.color, flatShading: true })
    const pageMat = new THREE.MeshLambertMaterial({ color: palette.pages, flatShading: true })
    const board = Math.min(0.003, w * 0.15)
    const g = new THREE.Group()
    // Spine and back cover (−x side), page block in between, front cover hinged on the +x side.
    const spine = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, board), coverMat)
    spine.position.set(0, 0, d / 2 - board / 2)
    const back = new THREE.Mesh(new THREE.BoxGeometry(board, hgt, d), coverMat)
    back.position.set(-w / 2 + board / 2, 0, 0)
    const pages = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.002, w - 2 * board), hgt * 0.97, d - board * 1.5), pageMat)
    pages.position.set(0, 0, -board * 0.75)
    const hinge = new THREE.Group()
    hinge.position.set(w / 2 - board / 2, 0, d / 2)
    const front = new THREE.Mesh(new THREE.BoxGeometry(board, hgt, d), coverMat)
    front.position.set(0, 0, -d / 2)
    hinge.add(front)
    g.add(spine, back, pages, hinge)
    for (const part of [spine, back, pages, front]) part.add(outline(part, { thresholdDeg: 20 }))
    g.traverse((o) => {
      o.castShadow = true
      o.receiveShadow = true
    })
    this.mesh = g
    this.cover = hinge
    this.scene.add(g)
    this.apply()
  }

  private shelfPose(p: BookPlacement, pull: number): Pose {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY)
    const out = new THREE.Vector3(Math.sin(p.rotY), 0, Math.cos(p.rotY)).multiplyScalar(pull)
    return { pos: new THREE.Vector3(p.x, p.y, p.z).add(out), quat: q }
  }

  private readPose(): Pose {
    this.camera.updateMatrixWorld()
    const m = this.camera.matrixWorld
    const right = new THREE.Vector3().setFromMatrixColumn(m, 0).normalize()
    const up = new THREE.Vector3().setFromMatrixColumn(m, 1).normalize()
    const back = new THREE.Vector3().setFromMatrixColumn(m, 2).normalize()
    // Front cover (+x) faces the camera, spine (+z) to the left.
    const basis = new THREE.Matrix4().makeBasis(back, up, right.clone().negate())
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis)
    const pos = this.camera.position.clone().addScaledVector(back, -0.6).addScaledVector(up, -0.04)
    return { pos, quat }
  }

  private apply(): void {
    if (!this.mesh || !this.placement) return
    const t = this.t
    const pullPhase = Math.min(1, t / 0.3)
    const travel = THREE.MathUtils.smootherstep(t, 0.25, 0.85)
    const openPhase = THREE.MathUtils.smootherstep(t, 0.6, 1)
    const a = this.shelfPose(this.placement, 0.22 * THREE.MathUtils.smoothstep(pullPhase, 0, 1))
    const b = this.readPose()
    this.mesh.position.lerpVectors(a.pos, b.pos, travel)
    this.mesh.position.y += Math.sin(travel * Math.PI) * 0.08
    this.mesh.quaternion.slerpQuaternions(a.quat, b.quat, travel)
    this.cover!.rotation.y = HINGE_OPEN * openPhase
  }

  get progress(): number {
    return this.t
  }
}

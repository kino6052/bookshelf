// Composes the scene: room, garden, bookcases, books, player. UI and reader attach to this.
import * as THREE from 'three'
import { config } from './config'
import { REDUCED_MOTION } from './env'
import { findFreeSpot, moveCircle } from './shared/collision'
import { layout, type AABB, type Layout } from './shared/layout'
import type { Book, Library } from './shared/types'
import { buildBookcases } from './scene/bookcases'
import { BookShelves } from './scene/books'
import { Engine } from './scene/engine'
import { FrostedGlass, moveToOutsideLayer } from './scene/frosted'
import { buildOutside, type Outside } from './scene/outside'
import { buildFurniture } from './scene/furniture'
import { palette } from './scene/palette'
import { buildLights, buildRoom, fitShadowCamera } from './scene/room'

export interface Pose {
  x: number
  z: number
  yaw: number
  pitch: number
}

export class App {
  readonly engine: Engine
  readonly shelves: BookShelves
  library: Library
  layout!: Layout
  authoring = false
  colliders: AABB[] = []
  readonly pose: Pose = { x: -0.6, z: 0.35, yaw: 0.25, pitch: -0.05 }
  /** Movement input in [-1, 1]: forward and strafe-right; set by the input modules. */
  readonly move = { forward: 0, right: 0, turn: 0, tilt: 0, run: false }

  private roomGroup?: THREE.Group
  private staticGroup = new THREE.Group()
  private outside?: Outside
  private sun?: THREE.DirectionalLight
  readonly glass = new FrostedGlass(!REDUCED_MOTION)

  constructor(container: HTMLElement, library: Library) {
    this.engine = new Engine(container)
    this.library = library
    this.shelves = new BookShelves(this.engine.renderer, { reducedMotion: REDUCED_MOTION })
    this.engine.scene.fog = new THREE.Fog(palette.fog, 6, 80)
    this.engine.scene.background = new THREE.Color(palette.fog)
    this.engine.scene.add(this.staticGroup, this.shelves.group)
    this.rebuild()
    this.engine.onFrame((dt, t) => this.frame(dt, t))
    this.engine.onContextChange = (lost) => {
      if (!lost) {
        this.shelves.invalidateLabels()
        this.glass.invalidate()
      }
    }
  }

  /** (Re)builds everything that depends on the layout. Cheap enough to run on each library change. */
  rebuild(change?: { added: string[]; removed: string[] }): void {
    const prevLength = this.layout?.room.length
    this.layout = layout(this.library, { authoring: this.authoring })
    if (prevLength !== this.layout.room.length || !this.roomGroup) {
      if (this.roomGroup) {
        this.engine.scene.remove(this.roomGroup)
        disposeTree(this.roomGroup)
      }
      const g = new THREE.Group()
      const room = buildRoom(this.layout.room, this.glass.material)
      const lights = buildLights(this.layout.room)
      this.outside = buildOutside(this.layout.room.length / 2, this.layout.room.depth / 2, REDUCED_MOTION)
      // The garden is only ever seen through the frosted glass, which samples a captured cube map of it.
      moveToOutsideLayer(this.outside.group)
      this.glass.setCenter(0, config.player.eyeHeight, 0)
      const furniture = buildFurniture(this.layout.room)
      g.add(room.group, lights.group, this.outside.group, furniture.mesh)
      this.sun = lights.sun
      fitShadowCamera(this.sun, this.layout.room)
      this.roomGroup = g
      this.engine.scene.add(g)
      this.roomColliders = [...room.colliders, ...furniture.colliders]
    }
    disposeTree(this.staticGroup)
    this.staticGroup.clear()
    this.staticGroup.add(buildBookcases(this.layout))
    this.colliders = [...this.roomColliders, ...this.layout.colliders]
    this.shelves.setLayout(this.layout, this.library, change)
    this.bookIndex = new Map(this.library.shelves.flatMap((s) => s.books).map((b) => [b.id, b]))
    this.onRebuild?.()
  }

  private roomColliders: AABB[] = []
  private bookIndex = new Map<string, Book>()
  /** Called after every rebuild (controllers refresh occluders, list view etc.). */
  onRebuild?: () => void

  private frame(dt: number, t: number): void {
    const p = this.pose
    // Keyboard turning (←/→) and looking up/down (PageUp/PageDown).
    if (this.move.turn || this.move.tilt) this.setPose({ yaw: p.yaw - this.move.turn * 1.9 * dt, pitch: p.pitch + this.move.tilt * 1.2 * dt })
    if (this.move.forward || this.move.right) {
      const speed = this.move.run ? config.player.runSpeed : config.player.walkSpeed
      const len = Math.hypot(this.move.forward, this.move.right) || 1
      const f = (this.move.forward / len) * speed * dt
      const r = (this.move.right / len) * speed * dt
      // yaw 0 looks down −z; right is +x.
      const dx = -Math.sin(p.yaw) * f + Math.cos(p.yaw) * r
      const dz = -Math.cos(p.yaw) * f - Math.sin(p.yaw) * r
      const next = moveCircle(p.x, p.z, dx, dz, config.player.radius, this.colliders)
      p.x = next.x
      p.z = next.z
    }
    this.syncCamera()
    this.outside?.update(dt, t)
    this.glass.update(dt, this.engine.renderer, this.engine.scene)
    this.shelves.update(dt, this.engine.camera.position)
  }

  syncCamera(): void {
    const cam = this.engine.camera
    cam.position.set(this.pose.x, config.player.eyeHeight, this.pose.z)
    cam.rotation.set(this.pose.pitch, this.pose.yaw, 0)
    cam.updateMatrixWorld()
  }

  /** Runs frame logic without the render loop (snapshots while the tab is hidden). */
  step(dt = 0): void {
    this.frame(dt, 0)
  }

  bookById(id: string): Book | undefined {
    return this.bookIndex.get(id)
  }

  /** Nearest walkable spot to (x, z). */
  safeSpot(x: number, z: number): { x: number; z: number } {
    return findFreeSpot(x, z, config.player.radius, this.colliders)
  }

  setPose(pose: Partial<Pose>): void {
    Object.assign(this.pose, pose)
    const maxPitch = THREE.MathUtils.degToRad(config.player.maxPitchDeg)
    this.pose.pitch = THREE.MathUtils.clamp(this.pose.pitch, -maxPitch, maxPitch)
    const safe = findFreeSpot(this.pose.x, this.pose.z, config.player.radius, this.colliders)
    this.pose.x = safe.x
    this.pose.z = safe.z
  }
}

function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat?.dispose()
  })
}

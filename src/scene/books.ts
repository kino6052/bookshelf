// All books on all shelves as one InstancedMesh, plus their spine labels, shelf plates and "+" ghosts.
import * as THREE from 'three'
import { config } from '../config'
import { displayDomain } from '../shared/linkfile'
import { toWorld, type BookPlacement, type Layout, type PlatePlacement, type PlusPlacement } from '../shared/layout'
import type { Book, Library } from '../shared/types'
import { LabelAtlas, atlasMaterial, paintPlate, paintSpine } from './labels'
import { boxEdgePositions, segmentsLine } from './outlines'
import { palette } from './palette'

const SPINE_SLOTS = { width: 2048, height: 2048, slotW: 32, slotH: 256 }
const PLATE_SLOTS = { width: 1024, height: 1024, slotW: 256, slotH: 64 }
const LABELS_PER_FRAME = 24

/** Box with a per-vertex "pageMask": 1 on the top, bottom and fore-edge faces (cream pages), 0 on spine and covers. */
function bookGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1)
  // BoxGeometry face order: +x, −x, +y, −y, +z, −z; four vertices each.
  const mask = [0, 0, 1, 1, 0, 1]
  const arr = new Float32Array(24)
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) arr[f * 4 + v] = mask[f]!
  g.setAttribute('pageMask', new THREE.BufferAttribute(arr, 1))
  return g
}

function bookMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.pageColor = { value: new THREE.Color(palette.pages) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float pageMask;\nuniform vec3 pageColor;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.xyz = mix(vColor.xyz, pageColor, pageMask);')
  }
  mat.customProgramCacheKey = () => 'book-pages'
  return mat
}

interface Anim {
  /** 0..1 progress, plus the kind of motion. */
  t: number
  kind: 'drop' | 'fade' | 'pulse'
  duration: number
}

export interface BookHit {
  kind: 'book' | 'plus'
  id: string
  distance: number
  point: THREE.Vector3
}

export class BookShelves {
  readonly group = new THREE.Group()
  private booksMesh: THREE.InstancedMesh
  private labelMesh: THREE.InstancedMesh
  private plateMesh: THREE.InstancedMesh
  private plusMesh: THREE.InstancedMesh
  private outlineLine = segmentsLine(new Float32Array(0), 'book-outlines')
  private readonly spineAtlas = new LabelAtlas(SPINE_SLOTS)
  private readonly plateAtlas = new LabelAtlas(PLATE_SLOTS)
  private readonly bookGeo = bookGeometry()
  private readonly bookMat = bookMaterial()

  private placements: BookPlacement[] = []
  private plates: PlatePlacement[] = []
  private plus: PlusPlacement[] = []
  private books = new Map<string, Book>()
  private indexOf = new Map<string, number>()
  /** Book id → spine slot; slot → book id. */
  private spineSlotOf = new Map<string, number>()
  private spineOwner = new Map<number, string>()
  private spineKey = new Map<string, string>()
  private plateSlotOf = new Map<string, number>()
  private plateOwner = new Map<number, string>()
  private hidden = new Set<string>()
  private anims = new Map<string, Anim>()
  private ghosts: { placement: BookPlacement; t: number }[] = []
  private hoverId: string | undefined
  private hoverPlus: string | undefined
  private reducedMotion: boolean

  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly v = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly c = new THREE.Color()
  private readonly up = new THREE.Vector3(0, 1, 0)

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    opts: { reducedMotion: boolean },
  ) {
    this.reducedMotion = opts.reducedMotion
    this.group.name = 'books'
    this.booksMesh = this.makeBooksMesh(16)
    this.labelMesh = this.makeQuadMesh(this.spineAtlas, this.spineAtlas.slots, 'spine-labels')
    this.plateMesh = this.makeQuadMesh(this.plateAtlas, this.plateAtlas.slots, 'shelf-plates')
    this.plusMesh = this.makePlusMesh(8)
    this.group.add(this.booksMesh, this.labelMesh, this.plateMesh, this.plusMesh, this.outlineLine)
  }

  private makeBooksMesh(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.bookGeo, this.bookMat, capacity)
    mesh.name = 'book-instances'
    mesh.count = 0
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.setColorAt(0, new THREE.Color())
    return mesh
  }

  private makeQuadMesh(atlas: LabelAtlas, count: number, name: string): THREE.InstancedMesh {
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.setAttribute('uvRect', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4))
    const mesh = new THREE.InstancedMesh(geo, atlasMaterial(atlas.texture), count)
    mesh.name = name
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    mesh.castShadow = false
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, zero)
      ;(geo.attributes.uvRect as THREE.InstancedBufferAttribute).setXYZW(i, ...atlas.uvRect(i))
    }
    return mesh
  }

  private makePlusMesh(capacity: number): THREE.InstancedMesh {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#2f6f8f'
    ctx.fillRect(28, 14, 8, 36)
    ctx.fillRect(14, 28, 36, 8)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshLambertMaterial({ map: tex, color: palette.ghost, transparent: true, opacity: 0.55, emissive: palette.ghost, emissiveIntensity: 0.25, depthWrite: false })
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, capacity)
    mesh.name = 'plus-slots'
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.setColorAt(0, new THREE.Color())
    return mesh
  }

  /** Replaces the shelf contents. Books whose placement changed glide; `added` ones drop in; `removed` ones fade out. */
  setLayout(layout: Layout, library: Library, change?: { added: string[]; removed: string[] }): void {
    const oldPlacements = new Map(this.placements.map((p) => [p.bookId, p]))
    if (change) {
      for (const id of change.removed) {
        const p = oldPlacements.get(id)
        if (p && !this.reducedMotion) this.ghosts.push({ placement: p, t: 0 })
      }
    }
    this.placements = layout.books
    this.plates = layout.plates
    this.plus = layout.plusSlots
    this.books = new Map(library.shelves.flatMap((s) => s.books).map((b) => [b.id, b]))
    this.indexOf = new Map(this.placements.map((p, i) => [p.bookId, i]))
    for (const id of [...this.hidden]) if (!this.indexOf.has(id)) this.hidden.delete(id)
    for (const id of [...this.anims.keys()]) if (!this.indexOf.has(id)) this.anims.delete(id)
    if (change && !this.reducedMotion) for (const id of change.added) this.anims.set(id, { t: 0, kind: 'drop', duration: 0.7 })

    const needed = this.placements.length + this.ghosts.length
    if (needed > this.booksMesh.instanceMatrix.count) {
      this.group.remove(this.booksMesh)
      this.booksMesh.dispose()
      this.booksMesh = this.makeBooksMesh(Math.max(16, Math.ceil(needed * 1.25)))
      this.group.add(this.booksMesh)
    }
    if (this.plus.length > this.plusMesh.instanceMatrix.count) {
      this.group.remove(this.plusMesh)
      this.plusMesh.dispose()
      this.plusMesh = this.makePlusMesh(Math.ceil(this.plus.length * 1.5))
      this.group.add(this.plusMesh)
    }

    // Labels whose text or colour changed must be redrawn; labels of departed books are freed.
    for (const [id, slot] of [...this.spineSlotOf]) {
      const b = this.books.get(id)
      const p = this.placements[this.indexOf.get(id) ?? -1]
      if (!b || !p || this.spineKey.get(id) !== spineKey(b, p)) this.freeSpine(id, slot)
    }
    // Plates are few and cheap: redraw them all (titles or positions may have changed).
    for (const [shelfId, slot] of [...this.plateSlotOf]) this.freePlate(shelfId, slot)
    this.writeAllBooks()
    this.writePlus()
    this.labelMesh.instanceMatrix.needsUpdate = true
    this.refreshOutlines()
  }

  /** Comic outlines for every book on a shelf (rebuilt when books move or are taken off the shelf). */
  private refreshOutlines(): void {
    const visible = [...this.placements.filter((p) => !this.hidden.has(p.bookId)), ...this.plates, ...this.plus]
    this.group.remove(this.outlineLine)
    this.outlineLine.geometry.dispose()
    this.outlineLine = segmentsLine(boxEdgePositions(visible), 'book-outlines')
    this.group.add(this.outlineLine)
  }

  get placementList(): readonly BookPlacement[] {
    return this.placements
  }

  placementOf(id: string): BookPlacement | undefined {
    const i = this.indexOf.get(id)
    return i === undefined ? undefined : this.placements[i]
  }

  plusOf(shelfId: string): PlusPlacement | undefined {
    return this.plus.find((p) => p.shelfId === shelfId)
  }

  isHidden(id: string): boolean {
    return this.hidden.has(id)
  }

  setHidden(id: string, hidden: boolean): void {
    if (hidden) this.hidden.add(id)
    else this.hidden.delete(id)
    this.writeBook(id)
    this.refreshOutlines()
  }

  setHover(id: string | undefined, plusShelf?: string): void {
    if (id === this.hoverId && plusShelf === this.hoverPlus) return
    const prev = this.hoverId
    this.hoverId = id
    if (prev) this.writeBook(prev)
    if (id) this.writeBook(id)
    if (plusShelf !== this.hoverPlus) {
      this.hoverPlus = plusShelf
      this.writePlus()
    }
  }

  pulse(id: string): void {
    if (!this.indexOf.has(id)) return
    this.anims.set(id, { t: 0, kind: 'pulse', duration: 2 })
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v
  }

  /** Per-frame: animations and lazy label generation near the player. */
  update(dt: number, player: THREE.Vector3): void {
    if (this.anims.size) {
      for (const [id, a] of this.anims) {
        a.t += dt / a.duration
        if (a.t >= 1) this.anims.delete(id)
        this.writeBook(id)
      }
    }
    if (this.ghosts.length) this.writeGhosts(dt)
    this.updateLabels(player)
  }

  // ---------- instance writing ----------

  private bookTransform(p: BookPlacement, id: string): { lift: number; scale: number; tint: number } {
    let lift = 0
    let scale = this.hidden.has(id) ? 0 : 1
    let tint = 0
    if (id === this.hoverId) {
      lift = 0.01
      tint = 0.35
    }
    const a = this.anims.get(id)
    if (a) {
      if (a.kind === 'drop') {
        const e = 1 - Math.pow(1 - Math.min(1, a.t), 3)
        lift += (1 - e) * 0.35
        scale *= 0.4 + 0.6 * e
      } else if (a.kind === 'pulse') {
        tint = Math.max(tint, 0.5 * (0.5 + 0.5 * Math.sin(a.t * Math.PI * 8)) * (1 - a.t))
      }
    }
    void p
    return { lift, scale, tint }
  }

  private composeBook(p: BookPlacement, lift: number, scale: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.q.setFromAxisAngle(this.up, p.rotY)
    this.v.set(p.x, p.y + lift, p.z)
    this.s.set(p.width * scale, p.height * scale, p.depth * scale)
    return out.compose(this.v, this.q, this.s)
  }

  private writeBook(id: string): void {
    const i = this.indexOf.get(id)
    if (i === undefined) return
    const p = this.placements[i]!
    const { lift, scale, tint } = this.bookTransform(p, id)
    this.booksMesh.setMatrixAt(i, this.composeBook(p, lift, scale, this.m))
    this.c.set(p.color)
    if (tint) this.c.lerp(new THREE.Color(palette.highlight), tint)
    this.booksMesh.setColorAt(i, this.c)
    this.booksMesh.instanceMatrix.needsUpdate = true
    this.booksMesh.instanceColor!.needsUpdate = true
    const slot = this.spineSlotOf.get(id)
    if (slot !== undefined) this.writeSpine(slot, p, lift, scale)
  }

  private writeAllBooks(): void {
    const mesh = this.booksMesh
    mesh.count = this.placements.length + this.ghosts.length
    this.placements.forEach((p, i) => {
      const { lift, scale, tint } = this.bookTransform(p, p.bookId)
      mesh.setMatrixAt(i, this.composeBook(p, lift, scale, this.m))
      this.c.set(p.color)
      if (tint) this.c.lerp(new THREE.Color(palette.highlight), tint)
      mesh.setColorAt(i, this.c)
      const slot = this.spineSlotOf.get(p.bookId)
      if (slot !== undefined) this.writeSpine(slot, p, lift, scale)
    })
    this.writeGhosts(0)
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
  }

  private writeGhosts(dt: number): void {
    const base = this.placements.length
    this.ghosts = this.ghosts.filter((g) => (g.t += dt / 0.6) < 1)
    this.booksMesh.count = base + this.ghosts.length
    this.ghosts.forEach((g, k) => {
      const e = 1 - g.t
      this.booksMesh.setMatrixAt(base + k, this.composeBook(g.placement, 0.0, e, this.m))
      this.booksMesh.setColorAt(base + k, this.c.set(g.placement.color).lerp(new THREE.Color('#ffffff'), g.t))
    })
    this.booksMesh.instanceMatrix.needsUpdate = true
    if (this.booksMesh.instanceColor) this.booksMesh.instanceColor.needsUpdate = true
  }

  private writeSpine(slot: number, p: BookPlacement, lift: number, scale: number): void {
    const front = toWorld(p, 0, (p.depth / 2) * scale + 0.0008)
    this.q.setFromAxisAngle(this.up, p.rotY)
    this.v.set(front.x, p.y + lift, front.z)
    this.s.set(p.width * scale * 0.98, p.height * scale * 0.985, 1)
    this.labelMesh.setMatrixAt(slot, this.m.compose(this.v, this.q, this.s))
    this.labelMesh.instanceMatrix.needsUpdate = true
  }

  private writePlus(): void {
    const mesh = this.plusMesh
    mesh.count = this.plus.length
    this.plus.forEach((p, i) => {
      const hovered = p.shelfId === this.hoverPlus
      this.q.setFromAxisAngle(this.up, p.rotY)
      mesh.setMatrixAt(i, this.m.compose(this.v.set(p.x, p.y + (hovered ? 0.01 : 0), p.z), this.q, this.s.set(p.width, p.height, p.depth)))
      mesh.setColorAt(i, this.c.set(hovered ? '#ffffff' : palette.ghost))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  // ---------- labels ----------

  private freeSpine(id: string, slot: number): void {
    this.spineSlotOf.delete(id)
    this.spineOwner.delete(slot)
    this.spineKey.delete(id)
    this.spineAtlas.release(slot)
    this.labelMesh.setMatrixAt(slot, this.m.makeScale(0, 0, 0))
    this.labelMesh.instanceMatrix.needsUpdate = true
  }

  private freePlate(shelfId: string, slot: number): void {
    this.plateSlotOf.delete(shelfId)
    this.plateOwner.delete(slot)
    this.plateAtlas.release(slot)
    this.plateMesh.setMatrixAt(slot, this.m.makeScale(0, 0, 0))
    this.plateMesh.instanceMatrix.needsUpdate = true
  }

  private labelTimer = 0

  private updateLabels(player: THREE.Vector3): void {
    if (this.labelTimer++ % 6 !== 0 && this.pendingSpines === 0) return
    const r = config.render.labelRadius
    const r2 = r * r
    // Nearest books within the radius get spine labels; the rest are evicted.
    const near: { id: string; d2: number; i: number }[] = []
    this.placements.forEach((p, i) => {
      const dx = p.x - player.x
      const dz = p.z - player.z
      const dy = p.y - player.y
      const d2 = dx * dx + dz * dz + dy * dy * 0.25
      if (d2 <= r2) near.push({ id: p.bookId, d2, i })
    })
    near.sort((a, b) => a.d2 - b.d2)
    const want = near.slice(0, this.spineAtlas.slots)
    const wantIds = new Set(want.map((w) => w.id))
    for (const [id, slot] of [...this.spineSlotOf]) if (!wantIds.has(id)) this.freeSpine(id, slot)
    let drawn = 0
    const todo = want.filter((w) => !this.spineSlotOf.has(w.id))
    this.pendingSpines = Math.max(0, todo.length - LABELS_PER_FRAME)
    for (const w of todo.slice(0, LABELS_PER_FRAME)) {
      const slot = this.spineAtlas.alloc()
      if (slot === undefined) break
      const p = this.placements[w.i]!
      const b = this.books.get(w.id)
      if (!b) continue
      this.spineAtlas.draw(this.renderer, slot, (ctx, cw, ch) => paintSpine(ctx, cw, ch, spineInfo(b, p)), ++drawn === Math.min(todo.length, LABELS_PER_FRAME))
      this.spineSlotOf.set(w.id, slot)
      this.spineOwner.set(slot, w.id)
      this.spineKey.set(w.id, spineKey(b, p))
      const { lift, scale } = this.bookTransform(p, w.id)
      this.writeSpine(slot, p, lift, scale)
    }
    if (drawn) this.spineAtlas.texture.generateMipmaps = true

    // Plates: few of them, same idea.
    const plateWant = this.plates
      .map((p) => ({ p, d2: (p.x - player.x) ** 2 + (p.z - player.z) ** 2 }))
      .filter((x) => x.d2 <= r2 * 2.5)
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, this.plateAtlas.slots)
    const plateIds = new Set(plateWant.map((x) => x.p.shelfId))
    for (const [id, slot] of [...this.plateSlotOf]) if (!plateIds.has(id)) this.freePlate(id, slot)
    const plateTodo = plateWant.filter((x) => !this.plateSlotOf.has(x.p.shelfId)).slice(0, 8)
    plateTodo.forEach((x, k) => {
      const slot = this.plateAtlas.alloc()
      if (slot === undefined) return
      this.plateAtlas.draw(this.renderer, slot, (ctx, cw, ch) => paintPlate(ctx, cw, ch, x.p.title), k === plateTodo.length - 1)
      this.plateSlotOf.set(x.p.shelfId, slot)
      this.plateOwner.set(slot, x.p.shelfId)
      this.q.setFromAxisAngle(this.up, x.p.rotY)
      this.plateMesh.setMatrixAt(slot, this.m.compose(this.v.set(x.p.x, x.p.y, x.p.z), this.q, this.s.set(x.p.width, x.p.height, 1)))
      this.plateMesh.instanceMatrix.needsUpdate = true
    })
  }

  private pendingSpines = 0

  /** Labels must be redrawn after a WebGL context restore. */
  invalidateLabels(): void {
    for (const [id, slot] of [...this.spineSlotOf]) this.freeSpine(id, slot)
    for (const [id, slot] of [...this.plateSlotOf]) this.freePlate(id, slot)
    this.spineAtlas.invalidate()
    this.plateAtlas.invalidate()
  }

  get labelStats(): { spines: number; plates: number; spineSlots: number } {
    return { spines: this.spineSlotOf.size, plates: this.plateSlotOf.size, spineSlots: this.spineAtlas.slots }
  }

  // ---------- picking ----------

  private readonly hits: THREE.Intersection[] = []

  raycast(raycaster: THREE.Raycaster): BookHit | undefined {
    this.hits.length = 0
    const best: BookHit[] = []
    this.booksMesh.raycast(raycaster, this.hits)
    for (const h of this.hits) {
      if (h.instanceId === undefined || h.instanceId >= this.placements.length) continue
      const p = this.placements[h.instanceId]!
      if (this.hidden.has(p.bookId)) continue
      best.push({ kind: 'book', id: p.bookId, distance: h.distance, point: h.point.clone() })
    }
    this.hits.length = 0
    if (this.plus.length) {
      this.plusMesh.raycast(raycaster, this.hits)
      for (const h of this.hits) {
        if (h.instanceId === undefined) continue
        const p = this.plus[h.instanceId]
        if (p) best.push({ kind: 'plus', id: p.shelfId, distance: h.distance, point: h.point.clone() })
      }
    }
    best.sort((a, b) => a.distance - b.distance)
    return best[0]
  }

  /** World-space spine centre of a book (for "Locate" and the open animation). */
  spineCenter(id: string): THREE.Vector3 | undefined {
    const p = this.placementOf(id)
    if (!p) return undefined
    const f = toWorld(p, 0, p.depth / 2)
    return new THREE.Vector3(f.x, p.y, f.z)
  }
}

function spineInfo(b: Book, p: BookPlacement) {
  return { title: b.title, author: b.author, color: p.color, website: b.format === 'url', domain: b.target ? displayDomain(b.target) : undefined }
}

function spineKey(b: Book, p: BookPlacement): string {
  return `${b.title}\u0001${b.author ?? ''}\u0001${p.color}\u0001${b.target ?? ''}`
}

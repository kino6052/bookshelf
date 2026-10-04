// Glue between the 3D app, input, interaction and the DOM UI.
import * as THREE from 'three'
import type { App } from './app'
import { config } from './config'
import { REDUCED_MOTION } from './env'
import { DesktopInput, type LookMode } from './input/desktop'
import { TouchInput } from './input/touch'
import { Interaction } from './scene/interaction'
import type { BookHit } from './scene/books'
import { displayDomain } from './shared/linkfile'
import type { Book } from './shared/types'
import { helpModal } from './ui/help'
import { Hud } from './ui/hud'
import type { ListView } from './ui/listview'
import type { Modal } from './ui/modal'
import { h } from './ui/dom'

export interface ControllerDeps {
  app: App
  list: ListView
  ui: HTMLElement
  openBook: (book: Book) => void
  /** True while the reader (or anything modal) owns input. */
  readerOpen: () => boolean
  onPlusSlot?: (shelfId: string) => void
  music?: { toggleMute(): void; setVolume(v: number): void }
}

export class Controller {
  readonly hud: Hud
  readonly desktop: DesktopInput
  readonly touch: TouchInput
  readonly interaction: Interaction
  readonly help: Modal
  /** 'look' = locked or free-look (crosshair); 'cursor' = free cursor + top bar; 'touch' = no crosshair. */
  mode: 'look' | 'cursor' | 'touch' = 'cursor'
  hovered: BookHit | undefined
  entered = false
  private glide: { from: { x: number; z: number; yaw: number; pitch: number }; to: { x: number; z: number; yaw: number; pitch: number }; t: number; then?: () => void } | undefined
  private modals: Modal[] = []
  private touchMode = false

  constructor(private readonly d: ControllerDeps) {
    const { app } = d
    this.help = helpModal(app.authoring)
    this.hud = new Hud({
      onResume: () => this.desktop.look(),
      onList: () => this.showList(),
      onHelp: () => this.help.show(),
      onMute: () => d.music?.toggleMute(),
      onVolume: (v) => d.music?.setVolume(v),
      onAddBook: () => d.onPlusSlot?.(''),
    })
    this.hud.setAuthoring(app.authoring)
    this.modals = [this.help, d.list.modal]
    this.interaction = new Interaction(app.engine.camera, app.shelves, app.engine.canvas)
    this.interaction.occluders = app.layout.occluders

    const look = (dx: number, dy: number) => {
      if (this.glide) return
      app.setPose({ yaw: app.pose.yaw - dx, pitch: app.pose.pitch - dy })
    }
    const setMove = (m: { forward: number; right: number; turn?: number; tilt?: number; run: boolean }) => {
      app.move.forward = m.forward
      app.move.right = m.right
      app.move.turn = m.turn ?? 0
      app.move.tilt = m.tilt ?? 0
      app.move.run = m.run
    }
    this.desktop = new DesktopInput(app.engine.canvas, {
      look,
      setMove,
      select: (at) => this.select(at ? { kind: 'point', ...at } : { kind: 'center' }),
      modeChange: (m: LookMode) => {
        this.mode = m === 'cursor' ? (this.touchMode ? 'touch' : 'cursor') : 'look'
        this.refreshHud()
      },
      key: (e) => {
        if (e.code === 'KeyM' && !e.repeat && !this.anyModal()) d.music?.toggleMute()
      },
      blocked: () => !this.entered || this.anyModal() || d.readerOpen(),
    })
    this.touch = new TouchInput(app.engine.canvas, {
      look,
      setMove: (forward, right, run) => setMove({ forward, right, run }),
      tap: (at) => {
        this.setTouchMode()
        this.select({ kind: 'point', ...at })
      },
      blocked: () => !this.entered || this.anyModal() || d.readerOpen(),
    })
    d.ui.append(this.hud.el, this.touch.el, this.help.el, d.list.modal.el)
    for (const m of this.modals) m.onClose = () => this.refreshHud()
    d.list.setLocate((b) => this.locate(b.id))
    app.engine.onFrame((dt) => this.frame(dt))
    this.refreshHud()
  }

  /** Called by the Enter overlay. Touch: no pointer lock. */
  enter(pointerType: string): void {
    this.entered = true
    if (pointerType === 'touch') this.setTouchMode()
    else this.desktop.look()
    this.refreshHud()
  }

  private setTouchMode(): void {
    this.touchMode = true
    if (this.mode !== 'look') this.mode = 'touch'
    this.refreshHud()
  }

  anyModal(): boolean {
    return this.modals.some((m) => m.open)
  }

  addModal(m: Modal): void {
    this.modals.push(m)
    const prev = m.onClose
    m.onClose = () => {
      prev?.()
      this.refreshHud()
    }
  }

  showList(): void {
    this.desktop.release()
    this.d.list.show()
    this.refreshHud()
  }

  refreshHud(): void {
    if (!this.entered || this.d.readerOpen()) this.hud.setMode('hidden')
    else this.hud.setMode(this.mode === 'look' ? 'locked' : this.mode === 'cursor' ? 'unlocked' : 'touch')
    if (this.d.readerOpen()) this.hud.setHover(undefined)
  }

  hoverText(hit: BookHit | undefined): string | undefined {
    if (!hit) return undefined
    if (hit.kind === 'plus') return 'Add a book to this shelf'
    const b = this.d.app.bookById(hit.id)
    if (!b) return undefined
    if (b.format === 'url') return `${b.title} — ${displayDomain(b.target!)} ↗`
    return b.author ? `${b.title} — ${b.author}` : b.title
  }

  private frame(dt: number): void {
    const { app } = this.d
    if (this.glide) {
      const g = this.glide
      g.t = Math.min(1, g.t + dt / (REDUCED_MOTION ? 0.001 : 1.1))
      const e = g.t < 0.5 ? 4 * g.t ** 3 : 1 - (-2 * g.t + 2) ** 3 / 2
      const lerpAngle = (a: number, b: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * e
      app.pose.x = THREE.MathUtils.lerp(g.from.x, g.to.x, e)
      app.pose.z = THREE.MathUtils.lerp(g.from.z, g.to.z, e)
      app.pose.yaw = lerpAngle(g.from.yaw, g.to.yaw)
      app.pose.pitch = THREE.MathUtils.lerp(g.from.pitch, g.to.pitch, e)
      if (g.t >= 1) {
        this.glide = undefined
        g.then?.()
      }
    }
    // Hover follows the active ray source: centre when locked, cursor when unlocked, nothing on touch.
    let hit: BookHit | undefined
    if (this.entered && !this.d.readerOpen() && !this.anyModal()) {
      if (this.mode === 'look') hit = this.interaction.pick({ kind: 'center' })
      else if (this.mode === 'cursor' && this.desktop.cursorPos) hit = this.interaction.pick({ kind: 'point', ...this.desktop.cursorPos })
    }
    this.setHovered(hit)
  }

  private setHovered(hit: BookHit | undefined): void {
    const same = hit?.kind === this.hovered?.kind && hit?.id === this.hovered?.id
    this.hovered = hit
    if (!same) {
      this.d.app.shelves.setHover(hit?.kind === 'book' ? hit.id : undefined, hit?.kind === 'plus' ? hit.id : undefined)
      this.d.app.engine.canvas.style.cursor = hit ? 'pointer' : ''
    }
    const text = this.hoverText(hit)
    this.hud.setHover(text, this.mode === 'cursor' ? this.desktop.cursorPos : undefined)
  }

  select(source: Parameters<Interaction['pick']>[0]): boolean {
    const hit = this.interaction.pick(source)
    if (!hit) return false
    if (hit.kind === 'plus') {
      this.desktop.release()
      this.d.onPlusSlot?.(hit.id)
      return true
    }
    const book = this.d.app.bookById(hit.id)
    if (!book) return false
    this.d.openBook(book)
    return true
  }

  /** Glides the camera to stand in front of a book, then pulses it. */
  locate(id: string): void {
    const { app } = this.d
    const p = app.shelves.placementOf(id)
    if (!p) return
    this.d.list.close()
    const nx = Math.sin(p.rotY)
    const nz = Math.cos(p.rotY)
    const dist = 1.15
    const to = { x: p.x + nx * dist, z: p.z + nz * dist, yaw: Math.atan2(nx, nz), pitch: Math.atan2(p.y - config.player.eyeHeight, dist) }
    const safe = app.safeSpot(to.x, to.z)
    to.x = safe.x
    to.z = safe.z
    this.glide = { from: { ...app.pose }, to, t: 0, then: () => app.shelves.pulse(id) }
    this.refreshHud()
  }

  get gliding(): boolean {
    return !!this.glide
  }

  notice(text: string): void {
    const el = h('div', { class: 'toast', role: 'status' }, text)
    this.d.ui.append(el)
    setTimeout(() => el.classList.add('out'), 2600)
    setTimeout(() => el.remove(), 3200)
  }
}

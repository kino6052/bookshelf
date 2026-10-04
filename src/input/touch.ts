// Touch: left-half virtual joystick, right-half drag-look, tap (≤ 10 px, ≤ 300 ms) selects. No pointer lock.
import { config } from '../config'
import { h } from '../ui/dom'

export interface TouchHandlers {
  look(dx: number, dy: number): void
  setMove(forward: number, right: number, run: boolean): void
  tap(at: { x: number; y: number }): void
  blocked(): boolean
}

const RADIUS = 56

export class TouchInput {
  readonly el: HTMLElement
  private readonly knob: HTMLElement
  private joy: { id: number; x: number; y: number } | undefined
  private looks = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: number }>()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hd: TouchHandlers,
  ) {
    this.knob = h('div', { class: 'joy-knob' })
    this.el = h('div', { class: 'joystick', hidden: true, 'aria-hidden': 'true' }, this.knob)
    canvas.addEventListener('pointerdown', (e) => this.down(e))
    canvas.addEventListener('pointermove', (e) => this.moveEv(e))
    canvas.addEventListener('pointerup', (e) => this.up(e))
    canvas.addEventListener('pointercancel', (e) => this.up(e, true))
  }

  private down(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || this.hd.blocked()) return
    e.preventDefault()
    this.canvas.setPointerCapture?.(e.pointerId)
    const leftHalf = e.clientX < this.canvas.clientWidth / 2
    if (leftHalf && !this.joy) {
      this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY }
      this.el.hidden = false
      this.el.style.left = `${e.clientX - RADIUS}px`
      this.el.style.top = `${e.clientY - RADIUS}px`
      this.knob.style.transform = 'translate(0px, 0px)'
    } else {
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 })
    }
  }

  private moveEv(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return
    if (this.joy && e.pointerId === this.joy.id) {
      let dx = e.clientX - this.joy.x
      let dy = e.clientY - this.joy.y
      const len = Math.hypot(dx, dy)
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS
        dy = (dy / len) * RADIUS
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`
      const mag = Math.min(1, len / RADIUS)
      // Push past ~85 % to run.
      this.hd.setMove(-dy / RADIUS, dx / RADIUS, mag > 0.85)
      return
    }
    const l = this.looks.get(e.pointerId)
    if (!l) return
    const dx = e.clientX - l.x
    const dy = e.clientY - l.y
    l.moved = Math.max(l.moved, Math.hypot(e.clientX - l.sx, e.clientY - l.sy))
    l.x = e.clientX
    l.y = e.clientY
    if (l.moved > 10) this.hd.look(dx * config.player.touchLookSensitivity, dy * config.player.touchLookSensitivity)
  }

  private up(e: PointerEvent, cancelled = false): void {
    if (e.pointerType !== 'touch') return
    if (this.joy && e.pointerId === this.joy.id) {
      this.joy = undefined
      this.el.hidden = true
      this.hd.setMove(0, 0, false)
      return
    }
    const l = this.looks.get(e.pointerId)
    this.looks.delete(e.pointerId)
    if (!l || cancelled) return
    if (l.moved <= 10 && performance.now() - l.t <= 300 && !this.hd.blocked()) this.hd.tap({ x: e.clientX, y: e.clientY })
  }
}

export function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

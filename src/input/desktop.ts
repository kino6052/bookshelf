// Desktop input, game-style: moving the mouse looks around (no button held), WASD walks, Shift runs.
// Keyboard only works too: Q/E (or ←/→) turn, ↑/↓ walk, PageUp/PageDown look up and down, F or Enter opens.
//
// Look modes:
//  - 'locked'   pointer lock (the normal case): mouse deltas turn the view, crosshair picks.
//  - 'freelook' pointer lock refused (some embedded browsers): plain mouse movement over the scene turns
//               the view anyway, crosshair picks. Same feel, minus an infinite mouse.
//  - 'cursor'   after Esc: the cursor is free for hover/click/drag-and-drop, WASD still walks, the
//               top bar shows; clicking empty scene goes back to looking around.
import { config } from '../config'

export type LookMode = 'locked' | 'freelook' | 'cursor'

export interface DesktopHandlers {
  look(dx: number, dy: number): void
  setMove(move: { forward: number; right: number; turn: number; tilt: number; run: boolean }): void
  /** Click / F / Enter. `at` is the cursor position in cursor mode. Returns true if something was selected. */
  select(at?: { x: number; y: number }): boolean
  modeChange(mode: LookMode): void
  key?(e: KeyboardEvent): void
  /** True while a dialog/reader is open: movement keys and scene clicks are ignored. */
  blocked(): boolean
}

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'ShiftLeft', 'ShiftRight'])

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

export class DesktopInput {
  mode: LookMode = 'cursor'
  private keys = new Set<string>()
  private cursor: { x: number; y: number } | undefined
  private lockUnsupported = false
  private lastMouse: { x: number; y: number } | undefined

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly h: DesktopHandlers,
  ) {
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.setMode('locked')
      else if (this.mode === 'locked') this.setMode('cursor') // Esc (or the browser) released the lock
    })
    document.addEventListener('pointerlockerror', () => this.lockRefused())
    document.addEventListener('mousemove', (e) => {
      if (this.mode === 'locked') this.h.look(e.movementX * config.player.lookSensitivity, e.movementY * config.player.lookSensitivity)
    })
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return
      if (this.mode === 'freelook' && !this.h.blocked()) {
        // movementX is 0 on some synthetic events; fall back to position deltas.
        const dx = e.movementX || (this.lastMouse ? e.clientX - this.lastMouse.x : 0)
        const dy = e.movementY || (this.lastMouse ? e.clientY - this.lastMouse.y : 0)
        this.lastMouse = { x: e.clientX, y: e.clientY }
        this.h.look(dx * config.player.lookSensitivity * 1.4, dy * config.player.lookSensitivity * 1.4)
        return
      }
      if (this.mode === 'cursor') this.cursor = { x: e.clientX, y: e.clientY }
    })
    canvas.addEventListener('pointerleave', () => {
      this.cursor = undefined
      this.lastMouse = undefined
    })
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0 || this.h.blocked()) return
      if (this.mode !== 'cursor') {
        this.h.select()
        return
      }
      // Cursor mode: open what's under the cursor, otherwise go back to looking around.
      if (!this.h.select({ x: e.clientX, y: e.clientY })) this.look()
    })
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return
      if (e.code === 'Escape' && this.mode === 'freelook' && !this.h.blocked()) {
        this.setMode('cursor')
        return
      }
      if (MOVE_KEYS.has(e.code) && !this.h.blocked()) {
        this.keys.add(e.code)
        this.sync()
        if (e.code.startsWith('Arrow') || e.code.startsWith('Page')) e.preventDefault()
      }
      if ((e.code === 'KeyF' || (e.code === 'Enter' && e.target === document.body)) && !e.repeat && !this.h.blocked()) {
        this.h.select(this.mode === 'cursor' ? this.cursor : undefined)
      }
      this.h.key?.(e)
    })
    window.addEventListener('keyup', (e) => {
      if (this.keys.delete(e.code)) this.sync()
    })
    window.addEventListener('blur', () => this.releaseKeys())
  }

  private setMode(m: LookMode): void {
    if (m === this.mode) return
    this.mode = m
    if (m !== 'cursor') this.cursor = undefined
    this.lastMouse = undefined
    this.h.modeChange(m)
  }

  private lockRefused(): void {
    this.lockUnsupported = true
    this.setMode('freelook')
  }

  releaseKeys(): void {
    this.keys.clear()
    this.sync()
  }

  private sync(): void {
    const k = this.keys
    const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    const right = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
    const turn = (k.has('KeyE') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyQ') || k.has('ArrowLeft') ? 1 : 0)
    const tilt = (k.has('PageUp') ? 1 : 0) - (k.has('PageDown') ? 1 : 0)
    this.h.setMove({ forward, right, turn, tilt, run: k.has('ShiftLeft') || k.has('ShiftRight') })
  }

  get cursorPos(): { x: number; y: number } | undefined {
    return this.mode === 'cursor' ? this.cursor : undefined
  }

  /** Enters look mode: pointer lock if the browser allows it, otherwise free-look. Needs a user gesture. */
  look(): void {
    if (this.lockUnsupported || !this.canvas.requestPointerLock) {
      this.setMode('freelook')
      return
    }
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined
      p?.catch?.(() => this.lockRefused())
    } catch {
      this.lockRefused()
    }
  }

  /** Frees the cursor (reader, list, dialogs). */
  release(): void {
    if (document.pointerLockElement) document.exitPointerLock()
    this.setMode('cursor')
  }
}

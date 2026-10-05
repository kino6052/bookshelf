// Renderer + loop: resize, dynamic resolution, WebGL context loss/restore, pause while the tab is hidden.
import * as THREE from 'three'
import { config } from '../config'
import { setOutlineResolution } from './outlines'

export type FrameFn = (dt: number, time: number) => void

export class Engine {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly canvas: HTMLCanvasElement
  pixelRatio: number
  /** Smoothed frame time in ms. */
  frameMs = 16
  contextLost = false
  onContextChange?: (lost: boolean) => void

  private frameFns: FrameFn[] = []
  private last = 0
  private time = 0
  private running = false
  private slowFrames = 0
  private fastFrames = 0
  private readonly maxRatio = Math.min(window.devicePixelRatio || 1, config.render.maxPixelRatio)

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
    this.canvas = this.renderer.domElement
    this.canvas.className = 'scene-canvas'
    this.canvas.setAttribute('aria-label', '3D library view')
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.pixelRatio = Math.min(this.maxRatio, 1.5)
    this.renderer.setPixelRatio(this.pixelRatio)
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900)
    this.camera.rotation.order = 'YXZ'
    container.append(this.canvas)
    this.resize()

    new ResizeObserver(() => this.resize()).observe(container)
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200))
    document.addEventListener('visibilitychange', () => (document.hidden ? this.pause() : this.resume()))
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.contextLost = true
      this.pause()
      this.onContextChange?.(true)
    })
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false
      this.onContextChange?.(false)
      this.resume()
    })
  }

  onFrame(fn: FrameFn): void {
    this.frameFns.push(fn)
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h, false)
    setOutlineResolution(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.renderer.setAnimationLoop((now) => this.tick(now))
  }

  pause(): void {
    this.renderer.setAnimationLoop(null)
  }

  resume(): void {
    if (!this.running || this.contextLost || document.hidden) return
    this.last = performance.now()
    this.renderer.setAnimationLoop((now) => this.tick(now))
  }

  get isPaused(): boolean {
    return document.hidden || this.contextLost
  }

  /** Runs every frame callback once without rendering (tests drive time while the tab isn't painting). */
  step(dt: number): void {
    this.time += dt
    for (const fn of this.frameFns) fn(dt, this.time)
  }

  renderOnce(): void {
    this.renderer.render(this.scene, this.camera)
  }

  private errorCount = 0

  private reportError(err: unknown): void {
    if (this.errorCount++ < 5) console.error('[engine] frame error', err)
  }

  private tick(now: number): void {
    // Clamp: a long stall (tab switch, debugger) must not teleport the player.
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000))
    this.last = now
    this.time += dt
    // An exception escaping here would stop three's animation loop for good: contain it per callback.
    for (const fn of this.frameFns) {
      try {
        fn(dt, this.time)
      } catch (err) {
        this.reportError(err)
      }
    }
    try {
      this.renderer.render(this.scene, this.camera)
    } catch (err) {
      this.reportError(err)
    }
    this.adaptResolution(dt * 1000)
  }

  /** Lowers the pixel ratio when frames are slow, raises it again when there's headroom. */
  private adaptResolution(ms: number): void {
    this.frameMs = this.frameMs * 0.92 + ms * 0.08
    const target = config.render.targetFrameMs
    if (this.frameMs > target * 1.2) {
      this.slowFrames++
      this.fastFrames = 0
    } else if (this.frameMs < target * 0.75) {
      this.fastFrames++
      this.slowFrames = 0
    } else {
      this.slowFrames = this.fastFrames = 0
    }
    let next = this.pixelRatio
    if (this.slowFrames > 30) next = Math.max(config.render.minPixelRatio, this.pixelRatio - 0.1)
    else if (this.fastFrames > 120) next = Math.min(this.maxRatio, this.pixelRatio + 0.05)
    if (next !== this.pixelRatio) {
      this.pixelRatio = Math.round(next * 100) / 100
      this.renderer.setPixelRatio(this.pixelRatio)
      this.resize()
      this.slowFrames = this.fastFrames = 0
    }
  }
}

export function webgl2Available(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    const ok = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return ok
  } catch {
    return false
  }
}

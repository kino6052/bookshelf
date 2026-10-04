// Label atlases: spine and plate labels are drawn lazily into slots of one big texture near the player,
// and evicted when far. One texture + one instanced quad mesh per atlas keeps it to a single draw call.
import * as THREE from 'three'

export interface AtlasOptions {
  width: number
  height: number
  slotW: number
  slotH: number
}

export class LabelAtlas {
  readonly texture: THREE.Texture
  readonly slots: number
  readonly cols: number
  private readonly scratch: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  private readonly scratchTexture: THREE.Texture
  private free: number[]
  private initialized = false

  constructor(readonly opts: AtlasOptions) {
    this.cols = Math.floor(opts.width / opts.slotW)
    this.slots = this.cols * Math.floor(opts.height / opts.slotH)
    const blank = document.createElement('canvas')
    blank.width = opts.width
    blank.height = opts.height
    const bctx = blank.getContext('2d')!
    bctx.fillStyle = '#888'
    bctx.fillRect(0, 0, opts.width, opts.height)
    this.texture = new THREE.CanvasTexture(blank)
    this.texture.flipY = false
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.minFilter = THREE.LinearMipmapLinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.generateMipmaps = true
    this.scratch = document.createElement('canvas')
    this.scratch.width = opts.slotW
    this.scratch.height = opts.slotH
    this.ctx = this.scratch.getContext('2d')!
    this.scratchTexture = new THREE.Texture(this.scratch)
    this.free = Array.from({ length: this.slots }, (_, i) => this.slots - 1 - i)
  }

  /** UV rect (u, v, du, dv) of a slot; v grows downward in image space (flipY is off). */
  uvRect(slot: number): [number, number, number, number] {
    const { width, height, slotW, slotH } = this.opts
    const x = (slot % this.cols) * slotW
    const y = Math.floor(slot / this.cols) * slotH
    return [x / width, y / height, slotW / width, slotH / height]
  }

  alloc(): number | undefined {
    return this.free.pop()
  }

  release(slot: number): void {
    this.free.push(slot)
  }

  get available(): number {
    return this.free.length
  }

  /** Draws with `paint` into the scratch canvas, then copies it into the slot on the GPU. */
  draw(renderer: THREE.WebGLRenderer, slot: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, last: boolean): void {
    if (!this.initialized) {
      renderer.initTexture(this.texture)
      this.initialized = true
    }
    const { slotW, slotH } = this.opts
    this.ctx.save()
    this.ctx.clearRect(0, 0, slotW, slotH)
    paint(this.ctx, slotW, slotH)
    this.ctx.restore()
    const x = (slot % this.cols) * slotW
    const y = Math.floor(slot / this.cols) * slotH
    // Mipmaps only need rebuilding once per batch.
    this.texture.generateMipmaps = last
    renderer.copyTextureToTexture(this.scratchTexture, this.texture, null, new THREE.Vector2(x, y))
    this.texture.generateMipmaps = true
  }

  /** After a context restore the GPU copy is blank again. */
  invalidate(): void {
    this.initialized = false
    this.texture.needsUpdate = true
  }
}

/** Lambert material whose map is addressed per instance through an `uvRect` attribute. */
export function atlasMaterial(texture: THREE.Texture, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map: texture, ...extra })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = uvRect.xy + vec2(uv.x, 1.0 - uv.y) * uvRect.zw;')
  }
  mat.customProgramCacheKey = () => 'atlas-uvrect'
  return mat
}

// ---------- painters ----------

const SERIF = 'Georgia, "Times New Roman", "Noto Serif", "Songti SC", "SimSun", serif'

function luminance(hex: string): number {
  const c = new THREE.Color(hex)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}

/** Shrinks the font until `text` fits `max` px, then ellipsizes. Returns the font size used. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, start: number, min: number, weight = ''): { text: string; size: number } {
  let size = start
  for (; size >= min; size -= 1) {
    ctx.font = `${weight} ${size}px ${SERIF}`
    if (ctx.measureText(text).width <= max) return { text, size }
  }
  size = min
  ctx.font = `${weight} ${size}px ${SERIF}`
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid) + '…').width <= max) lo = mid
    else hi = mid - 1
  }
  return { text: text.slice(0, lo).trimEnd() + '…', size }
}

export interface SpineInfo {
  title: string
  author?: string
  color: string
  website: boolean
  domain?: string
}

function globe(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.moveTo(cx - r, cy)
  ctx.lineTo(cx + r, cy)
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx, cy + r)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2)
  ctx.stroke()
}

/** Spine label: title running top-to-bottom, author at the foot; website books get a globe and the domain. */
export function paintSpine(ctx: CanvasRenderingContext2D, w: number, h: number, info: SpineInfo): void {
  const dark = luminance(info.color) < 0.45
  const ink = dark ? '#f3ecdc' : '#2b2a27'
  ctx.fillStyle = info.color
  ctx.fillRect(0, 0, w, h)
  // Two thin bands near head and foot, like a cloth binding.
  ctx.fillStyle = dark ? 'rgba(255,240,200,0.35)' : 'rgba(0,0,0,0.25)'
  ctx.fillRect(0, 10, w, 2)
  ctx.fillRect(0, h - 12, w, 2)
  ctx.fillStyle = ink
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  if (info.website) {
    // Head band with a white globe: the at-a-glance mark of a website book.
    ctx.fillStyle = '#2f5f7f'
    ctx.fillRect(0, 0, w, 46)
    globe(ctx, w / 2, 24, Math.min(11, w / 2 - 3), '#ffffff')
    ctx.fillStyle = ink
    ctx.save()
    ctx.translate(w / 2, 54)
    ctx.rotate(Math.PI / 2)
    ctx.textAlign = 'left'
    const t = fitText(ctx, info.title, h - 70, 15, 10, '600')
    ctx.fillText(t.text, 0, -6)
    const d = fitText(ctx, info.domain ?? '', h - 70, 11, 8)
    ctx.globalAlpha = 0.8
    ctx.fillText(d.text, 0, 8)
    ctx.restore()
    return
  }
  const authorSpace = info.author ? 64 : 0
  ctx.save()
  ctx.translate(w / 2, 16)
  ctx.rotate(Math.PI / 2)
  ctx.textAlign = 'left'
  const t = fitText(ctx, info.title, h - 32 - authorSpace - 6, 19, 11, '600')
  ctx.fillText(t.text, 0, 1)
  if (info.author) {
    const last = info.author.split(/\s+/).pop() ?? info.author
    const a = fitText(ctx, last, authorSpace - 6, 13, 9)
    ctx.globalAlpha = 0.85
    ctx.fillText(a.text, h - 32 - authorSpace + 6, 1)
  }
  ctx.restore()
}

export function paintPlate(ctx: CanvasRenderingContext2D, w: number, h: number, title: string): void {
  ctx.fillStyle = '#f8f7f3'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#c9c4b8'
  ctx.lineWidth = 2
  ctx.strokeRect(3, 3, w - 6, h - 6)
  ctx.fillStyle = '#3b3a36'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const t = fitText(ctx, title.toUpperCase(), w - 24, 30, 14, '600')
  ctx.fillText(t.text, w / 2, h / 2 + 1)
}

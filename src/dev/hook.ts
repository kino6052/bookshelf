// window.__bookshelf: the test hook (dev and `--mode e2e` builds only).
import type { App, Pose } from '../app'
import type { Controller } from '../controller'
import type { Reader } from '../reader/reader'
import type { BookOpener } from '../scene/opener'
import type { ListView } from '../ui/listview'
import type { EnterOverlay } from '../ui/overlay'

export interface HookParts {
  controller: Controller
  reader: Reader
  opener: BookOpener
  list: ListView
  overlay: EnterOverlay
}

export function installTestHook(app: App, parts: HookParts): void {
  const { controller, reader, opener } = parts
  const hook = {
    ready: true,
    app,
    ...parts,
    pose: () => ({ ...app.pose }),
    teleport(pose: Partial<Pose>) {
      app.setPose(pose)
      app.syncCamera()
      return { ...app.pose }
    },
    /** Skips the Enter overlay (no pointer lock: the unlocked, cursor-driven state). */
    enter() {
      parts.overlay.hide()
      controller.entered = true
      controller.refreshHud()
    },
    hovered: () => (controller.hovered ? { ...controller.hovered, label: controller.hoverText(controller.hovered) } : undefined),
    /** Picks with the centre ray, like a locked player pressing E. */
    pickCenter: () => {
      app.syncCamera()
      const hit = controller.interaction.pick({ kind: 'center' })
      return hit ? { kind: hit.kind, id: hit.id, distance: hit.distance, label: controller.hoverText(hit) } : undefined
    },
    select: (id: string) => {
      const b = app.bookById(id)
      if (b) controller['d'].openBook(b)
      return !!b
    },
    /** Stands in front of a book, looking at it. */
    faceBook(id: string, dist = 1.1) {
      const p = app.shelves.placementOf(id)
      if (!p) return undefined
      const nx = Math.sin(p.rotY)
      const nz = Math.cos(p.rotY)
      app.setPose({ x: p.x + nx * dist, z: p.z + nz * dist, yaw: Math.atan2(nx, nz), pitch: Math.atan2(p.y - 1.65, dist) })
      app.syncCamera()
      return { ...app.pose }
    },
    state: () => ({ opener: opener.state, openBook: opener.bookId, reader: reader.currentBook?.id, hiddenBooks: app.shelves.placementList.filter((p) => app.shelves.isHidden(p.bookId)).map((p) => p.bookId) }),
    closeReader: () => reader.close(),
    info: () => ({ ...app.engine.renderer.info.render, memory: { ...app.engine.renderer.info.memory }, pixelRatio: app.engine.pixelRatio, frameMs: app.engine.frameMs }),
    layoutInfo: () => ({
      room: app.layout.room,
      sections: app.layout.sections.length,
      decor: app.layout.decor.length,
      books: app.layout.books.length,
      boardsUsed: app.layout.boardsUsed,
      labels: app.shelves.labelStats,
    }),
    placement: (id: string) => app.shelves.placementOf(id),
    /** Advances all frame logic (player, opener, labels…) by dt seconds, n times. */
    step: (dt = 1 / 60, n = 1) => {
      for (let i = 0; i < n; i++) app.engine.step(dt)
    },
    /** Renders a frame and saves the canvas to docs/verification/<name>.png (dev/preview servers only). */
    async snapshot(name: string, width = 1280, height = 800) {
      // Fixed size, so snapshots work even while the pane is hidden (the canvas collapses then).
      const r = app.engine.renderer
      const cam = app.engine.camera
      const prev = r.getSize(new (await import('three')).Vector2())
      const prevRatio = r.getPixelRatio()
      r.setPixelRatio(1)
      r.setSize(width, height, false)
      cam.aspect = width / height
      cam.updateProjectionMatrix()
      for (let i = 0; i < 40; i++) app.engine.step(0)
      app.engine.renderOnce()
      const data = app.engine.canvas.toDataURL('image/png')
      r.setPixelRatio(prevRatio)
      r.setSize(Math.max(1, prev.x), Math.max(1, prev.y), false)
      app.engine.resize()
      const res = await fetch(`__verify/snapshot?name=${encodeURIComponent(name)}`, { method: 'POST', body: data })
      return res.json()
    },
  }
  ;(window as unknown as { __bookshelf: typeof hook }).__bookshelf = hook
}

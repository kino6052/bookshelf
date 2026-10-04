// window.__bookshelf: the test hook (dev and `--mode e2e` builds only).
import type { App, Pose } from '../app'

export function installTestHook(app: App): void {
  const hook = {
    ready: true,
    app,
    pose: () => ({ ...app.pose }),
    teleport(pose: Partial<Pose>) {
      app.setPose(pose)
      return { ...app.pose }
    },
    info: () => ({ ...app.engine.renderer.info.render, memory: { ...app.engine.renderer.info.memory }, pixelRatio: app.engine.pixelRatio, frameMs: app.engine.frameMs }),
    layoutInfo: () => ({
      room: app.layout.room,
      sections: app.layout.sections.length,
      stacks: app.layout.stacks.length,
      books: app.layout.books.length,
      boardsUsed: app.layout.boardsUsed,
      labels: app.shelves.labelStats,
    }),
    placement: (id: string) => app.shelves.placementOf(id),
    /** Renders a frame and saves the canvas to docs/verification/<name>.png (dev/preview servers only). */
    async snapshot(name: string) {
      for (let i = 0; i < 40; i++) app.step(0)
      app.engine.renderOnce()
      const data = app.engine.canvas.toDataURL('image/png')
      const res = await fetch(`__verify/snapshot?name=${encodeURIComponent(name)}`, { method: 'POST', body: data })
      return res.json()
    },
  }
  ;(window as unknown as { __bookshelf: typeof hook }).__bookshelf = hook
}

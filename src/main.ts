import './styles.css'
import { App } from './app'
import { loadLibrary } from './data/library'
import { TEST_HOOKS } from './env'
import { installTestHook } from './dev/hook'

async function boot(): Promise<void> {
  const root = document.getElementById('app')!
  const { library } = await loadLibrary()
  const app = new App(root, library)
  app.engine.start()

  // Temporary desktop controls until M3: WASD + drag to look.
  const keys = new Set<string>()
  const sync = () => {
    app.move.forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
    app.move.right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
    app.move.run = keys.has('ShiftLeft') || keys.has('ShiftRight')
  }
  addEventListener('keydown', (e) => (keys.add(e.code), sync()))
  addEventListener('keyup', (e) => (keys.delete(e.code), sync()))
  addEventListener('blur', () => (keys.clear(), sync()))
  let dragging = false
  app.engine.canvas.addEventListener('pointerdown', () => (dragging = true))
  addEventListener('pointerup', () => (dragging = false))
  addEventListener('pointermove', (e) => {
    if (!dragging) return
    app.setPose({ yaw: app.pose.yaw - e.movementX * 0.004, pitch: app.pose.pitch - e.movementY * 0.004 })
  })

  if (TEST_HOOKS) installTestHook(app)
}

void boot()

import './styles.css'
import './ui/ui.css'
import { App } from './app'
import { Controller } from './controller'
import { loadLibrary, onLibraryEvent } from './data/library'
import { FORCE_NO_WEBGL, REDUCED_MOTION, TEST_HOOKS } from './env'
import { installTestHook } from './dev/hook'
import { isTouchDevice } from './input/touch'
import { Reader } from './reader/reader'
import { webgl2Available } from './scene/engine'
import { BookOpener } from './scene/opener'
import { diffLibrary } from './shared/diff'
import type { Book, Library } from './shared/types'
import { h } from './ui/dom'
import { ListView } from './ui/listview'
import { EnterOverlay } from './ui/overlay'

async function boot(): Promise<void> {
  const root = document.getElementById('app')!
  const ui = h('div', { class: 'ui' })
  document.body.append(ui)

  const reader = new Reader()
  let openBook: (book: Book) => void = (b) => reader.open(b)
  const list = new ListView({
    onOpen: (b) => {
      list.close()
      openBook(b)
    },
  })
  const overlay = new EnterOverlay({
    touch: isTouchDevice(),
    onEnter: (pointerType) => enter(pointerType),
    onList: () => list.show(),
  })
  ui.append(overlay.el, list.modal.el, reader.el)
  let enter = (_pointerType: string) => overlay.hide()

  overlay.progress(0.15, 'Loading the library…')
  let library: Library
  try {
    library = (await loadLibrary()).library
  } catch (err) {
    console.error('[library]', err)
    overlay.error('The library index (library.json) could not be loaded.', () => location.reload())
    return
  }
  list.setLibrary(library)
  const count = library.shelves.reduce((n, s) => n + s.books.length, 0)
  const summary = `${count} ${count === 1 ? 'book' : 'books'} on ${library.shelves.length} ${library.shelves.length === 1 ? 'shelf' : 'shelves'}`

  // No WebGL2 (or the context can't be created): the list view is the whole site.
  const fallback = (why: string) => {
    overlay.hide()
    list.setNotice(`${why} Here is the library as a list instead.`)
    list.modal.onClose = () => ui.append(reopen)
    const reopen = h('button', { class: 'btn btn-primary fallback-open', type: 'button', onclick: () => (reopen.remove(), list.show()) }, 'Show the list')
    list.show()
  }
  if (FORCE_NO_WEBGL || !webgl2Available()) return fallback('This browser can’t show the 3D room (WebGL2 is not available).')
  let app: App
  try {
    overlay.progress(0.5, 'Building the room…')
    app = new App(root, library)
  } catch (err) {
    console.error('[scene]', err)
    return fallback('The 3D room could not be started on this device.')
  }

  const opener = new BookOpener(app.engine.scene, app.engine.camera, app.shelves, REDUCED_MOTION)
  let relockAfterClose = false
  const controller = new Controller({
    app,
    list,
    ui,
    openBook: (b) => openBook(b),
    readerOpen: () => reader.isOpen || opener.state !== 'idle',
  })
  app.onRebuild = () => {
    controller.interaction.occluders = app.layout.occluders
  }
  app.engine.onFrame((dt) => {
    opener.update(dt)
    opener.follow()
  })
  opener.onStateChange = () => controller.refreshHud()

  openBook = (b) => {
    if (reader.isOpen || opener.state !== 'idle') return // rapid clicks
    relockAfterClose = controller.mode === 'look'
    controller.desktop.release()
    opener.open(b.id) // no-op (reader only) if the book isn't on a shelf
    reader.open(b)
    controller.refreshHud()
  }
  reader.onClose = () => {
    opener.close()
    controller.refreshHud()
    if (relockAfterClose) controller.desktop.look()
  }

  // Dev server: content changes arrive as an HMR event; diff and update in place (no reload).
  onLibraryEvent(async () => {
    try {
      const next = (await loadLibrary()).library
      const d = diffLibrary(app.library, next)
      if (d.unchanged) return
      app.library = next
      app.rebuild({ added: d.added.map((b) => b.id), removed: d.removed.map((b) => b.id) })
      list.setLibrary(next)
      window.dispatchEvent(new CustomEvent('bookshelf:updated', { detail: d }))
    } catch (err) {
      console.warn('[library] live update failed', err)
    }
  })

  enter = (pointerType) => {
    overlay.hide()
    controller.enter(pointerType)
  }
  app.engine.start()
  overlay.ready(summary)
  if (TEST_HOOKS) installTestHook(app, { controller, reader, opener, list, overlay })
}

function applyMotionPreference(): void {
  document.documentElement.classList.toggle('reduced-motion', REDUCED_MOTION)
}

applyMotionPreference()
void boot()

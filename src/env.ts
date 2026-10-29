/** Test hooks (window.__bookshelf, ?stress=N, self-tests) exist only in dev and in builds made with `--mode e2e`. */
export const TEST_HOOKS: boolean = import.meta.env.DEV || import.meta.env.VITE_E2E === '1'

const params = typeof location === 'object' ? new URLSearchParams(location.search) : new URLSearchParams()

/** prefers-reduced-motion, or `?reducedMotion=1` in test builds. */
export const REDUCED_MOTION: boolean =
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || (TEST_HOOKS && params.get('reducedMotion') === '1')

/** `?webgl=0` in test builds simulates a browser without WebGL2 (exercises the List-view fallback). */
export const FORCE_NO_WEBGL: boolean = TEST_HOOKS && params.get('webgl') === '0'

/** `?view=list`: the library as a list only, with no 3D room (how the phone app opens it). */
export const LIST_ONLY: boolean = params.get('view') === 'list'

/** Test hooks (window.__bookshelf, ?stress=N, self-tests) exist only in dev and in builds made with `--mode e2e`. */
export const TEST_HOOKS: boolean = import.meta.env.DEV || import.meta.env.VITE_E2E === '1'

export const REDUCED_MOTION: boolean = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

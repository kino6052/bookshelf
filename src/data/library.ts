// Client side of the manifest: fetch, validate, stress mode, live updates.
import { makeStressLibrary } from '../shared/stress'
import type { Library } from '../shared/types'
import { validateLibrary } from '../shared/validate'
import { TEST_HOOKS } from '../env'

export interface LoadedLibrary {
  library: Library
  warnings: string[]
  stress: boolean
}

export function stressCount(): number | undefined {
  if (!TEST_HOOKS) return undefined
  const v = new URLSearchParams(location.search).get('stress')
  if (v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
}

export async function loadLibrary(signal?: AbortSignal): Promise<LoadedLibrary> {
  const n = stressCount()
  if (n !== undefined) return { library: makeStressLibrary(n), warnings: [], stress: true }
  const res = await fetch('library.json', { cache: 'no-store', signal })
  if (!res.ok) throw new Error(`library.json: HTTP ${res.status}`)
  let raw: unknown
  try {
    raw = await res.json()
  } catch {
    throw new Error('library.json is not valid JSON')
  }
  const { library, warnings } = validateLibrary(raw)
  for (const w of warnings) console.warn(`[library] ${w}`)
  return { library, warnings, stress: false }
}

/** Calls `onChange` when the dev server pushes a content change (no-op in production builds). */
export function onLibraryEvent(onChange: () => void): void {
  if (import.meta.hot) import.meta.hot.on('bookshelf:library', onChange)
}

import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export type Tree = { [name: string]: string | Buffer | Tree }

/** Writes a directory tree into a fresh temp dir. Leaves are file contents. */
export async function makeTree(tree: Tree, prefix = 'bookshelf-test-'): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  await writeTree(root, tree)
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

export async function writeTree(dir: string, tree: Tree): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const [name, value] of Object.entries(tree)) {
    const p = path.join(dir, name)
    if (typeof value === 'string' || Buffer.isBuffer(value)) {
      await writeFile(p, value)
      await utimes(p, 1_700_000_000, 1_700_000_000)
    } else {
      await writeTree(p, value)
    }
  }
}

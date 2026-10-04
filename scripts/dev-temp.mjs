// Starts the dev server against a throwaway copy of the content folders, so tests never touch the real library.
// Usage: npm run dev:temp            (fresh copy of books/ and music/ in the OS temp dir)
//        npm run dev:temp -- --empty (empty books/ and music/)
import { cp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

const empty = process.argv.includes('--empty')
const root = path.join(tmpdir(), 'bookshelf-dev-temp')
await rm(root, { recursive: true, force: true })
const books = path.join(root, 'books')
const music = path.join(root, 'music')
if (empty) {
  await mkdir(books, { recursive: true })
  await mkdir(music, { recursive: true })
} else {
  await cp(path.resolve('books'), books, { recursive: true })
  await cp(path.resolve('music'), music, { recursive: true })
}
process.env.BOOKSHELF_BOOKS_DIR = books
process.env.BOOKSHELF_MUSIC_DIR = music

const server = await createServer({ server: { host: '127.0.0.1', port: 5175, strictPort: true } })
await server.listen()
server.printUrls()
console.log(`[dev-temp] content root: ${root}`)

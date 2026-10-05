// ?stress=N: a deterministic synthetic library for budget and layout testing (dev and e2e builds only).
import { mulberry32 } from './hash.ts'
import type { Book, Format, Library, Shelf } from './types.ts'

const AUTHORS = ['Plato', 'Aristotle', 'Augustine', 'Boethius', 'Aquinas', 'Descartes', 'Spinoza', 'Leibniz', 'Locke', 'Berkeley', 'Hume', 'Kant', 'Hegel', 'Schopenhauer', 'Nietzsche', 'Πλάτων', '孔子', 'Montaigne', 'Pascal', 'Kierkegaard']
const WORDS = ['Critique', 'Treatise', 'Meditations', 'Essay', 'Dialogues', 'Ethics', 'Principles', 'Enquiry', 'Republic', 'Metaphysics', 'Reason', 'Understanding', 'Nature', 'Mind', 'Being', 'Time', 'Virtue', 'Knowledge', 'Soul', 'God', 'Ἠθικά', '論語', 'Monadology', 'Consolation']
const SHELF_NAMES = ['Ancient', 'Medieval', 'Rationalists', 'Empiricists', 'Idealists', 'Moderns', 'Novels', 'Poetry', 'History', 'Science', 'Essays', 'Letters']
const FORMATS: Format[] = ['md', 'txt', 'pdf', 'epub']

export function makeStressLibrary(n: number, seed = 1): Library {
  const rand = mulberry32(seed)
  const count = Math.max(0, Math.min(Math.floor(n), 20000))
  const shelves: Shelf[] = []
  if (count === 0) return { version: 1, shelves, tracks: [] }
  const shelfCount = Math.max(1, Math.round(count / 30))
  for (let s = 0; s < shelfCount; s++) {
    const id = `${String(s + 1).padStart(2, '0')}-stress-${s + 1}`
    shelves.push({ id, title: `${SHELF_NAMES[s % SHELF_NAMES.length]} ${Math.floor(s / SHELF_NAMES.length) + 1}`, order: s + 1, books: [] })
  }
  // Uneven shelf sizes: some span several boards, some hold a handful.
  const weights = shelves.map(() => 0.2 + rand() * rand() * 4)
  const total = weights.reduce((a, b) => a + b, 0)
  const pick = () => {
    let r = rand() * total
    for (let i = 0; i < weights.length; i++) if ((r -= weights[i]!) <= 0) return i
    return weights.length - 1
  }
  for (let i = 0; i < count; i++) {
    const shelf = shelves[i === 0 ? 0 : pick()]!
    const isWeb = rand() < 0.1
    const words = 1 + Math.floor(rand() * (rand() < 0.05 ? 14 : 4))
    const title = Array.from({ length: words }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(' ')
    const author = AUTHORS[Math.floor(rand() * AUTHORS.length)]!
    const format: Format = isWeb ? 'url' : FORMATS[Math.floor(rand() * FORMATS.length)]!
    const file = `${author} - ${title} ${i + 1}.${format}`
    const book: Book = {
      id: `${shelf.id}/${file}`,
      shelfId: shelf.id,
      url: `books/${encodeURIComponent(shelf.id)}/${encodeURIComponent(file)}?v=1`,
      format,
      title: `${title} ${i + 1}`,
      author,
      bytes: Math.floor(Math.exp(rand() * 15) * 300),
      mtime: 1_700_000_000_000 + i,
    }
    if (isWeb) {
      book.target = `https://stress-${i % 50}.example.org/page/${i + 1}`
      book.embed = 'auto'
      book.author = `stress-${i % 50}.example.org`
    }
    shelf.books.push(book)
  }
  return { version: 1, shelves, tracks: [] }
}

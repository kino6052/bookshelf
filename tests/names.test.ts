import { describe, expect, it } from 'vitest'
import { parseBookFilename, sanitizeFilename, shelfNumberFromFolder, shelfTitleFromFolder, slugify, withCopySuffix } from '../src/shared/names'

describe('names', () => {
  it('derives shelf titles and numbers from folder names', () => {
    expect(shelfTitleFromFolder('03-rationalists')).toBe('Rationalists')
    expect(shelfTitleFromFolder('05-kant-and_after')).toBe('Kant And After')
    expect(shelfTitleFromFolder('poetry')).toBe('Poetry')
    expect(shelfNumberFromFolder('03-rationalists')).toBe(3)
    expect(shelfNumberFromFolder('poetry')).toBeUndefined()
  })

  it('splits "Author - Title" on the first " - "', () => {
    expect(parseBookFilename('Plato - The Republic.md')).toEqual({ author: 'Plato', title: 'The Republic' })
    expect(parseBookFilename('Hume - Enquiry - Part 2.txt')).toEqual({ author: 'Hume', title: 'Enquiry - Part 2' })
    expect(parseBookFilename('meditations_on_first_philosophy.pdf')).toEqual({ title: 'meditations on first philosophy' })
  })

  it('rejects unsafe upload filenames', () => {
    for (const bad of ['../x.md', 'a/b.md', 'a\b.md', 'CON.txt', 'nul', 'com1.pdf', 'x.md.', '.hidden.md', 'a\u0001.md', 'a:b.md', '']) {
      expect(sanitizeFilename(bad).ok, bad).toBe(false)
    }
    expect(sanitizeFilename('Spinoza - Ethics (Ἠθική) #1 & 50%.epub')).toEqual({ ok: true, name: 'Spinoza - Ethics (Ἠθική) #1 & 50%.epub' })
  })

  it('makes slugs and copy suffixes', () => {
    expect(slugify('Rationalists & Co.')).toBe('rationalists-co')
    expect(slugify('Écrits')).toBe('ecrits')
    expect(slugify('!!!')).toBe('shelf')
    expect(withCopySuffix('Book.pdf', 2)).toBe('Book (2).pdf')
  })
})

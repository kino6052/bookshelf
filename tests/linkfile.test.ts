import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanLibrary } from '../server/scan'
import { displayDomain, makeUrlFile, parseUrlFile, parseWeblocFile, validateTarget } from '../src/shared/linkfile'
import { makeTree } from './helpers/fixture'

const BOM = String.fromCharCode(0xfeff)

describe('parseUrlFile', () => {
  it('reads [InternetShortcut] URL= with CRLF, LF, a BOM and any key case', () => {
    expect(parseUrlFile('[InternetShortcut]\r\nURL=https://plato.stanford.edu/\r\n')).toBe('https://plato.stanford.edu/')
    expect(parseUrlFile('[InternetShortcut]\nURL=https://a.example/\n')).toBe('https://a.example/')
    expect(parseUrlFile(`${BOM}[InternetShortcut]\r\nURL=https://b.example/`)).toBe('https://b.example/')
    expect(parseUrlFile('[internetshortcut]\nurl = https://c.example/x?y=1\n')).toBe('https://c.example/x?y=1')
    expect(parseUrlFile('[INTERNETSHORTCUT]\nIconIndex=0\nUrl=https://d.example/')).toBe('https://d.example/')
  })

  it('ignores URL= keys in other sections and returns undefined when missing', () => {
    expect(parseUrlFile('[Other]\nURL=https://wrong.example/\n[InternetShortcut]\nIconIndex=1\n')).toBeUndefined()
    expect(parseUrlFile('[InternetShortcut]\nIconFile=x.ico\n')).toBeUndefined()
    expect(parseUrlFile('')).toBeUndefined()
  })

  it('round-trips makeUrlFile', () => {
    expect(parseUrlFile(makeUrlFile('https://iep.utm.edu/'))).toBe('https://iep.utm.edu/')
  })
})

describe('parseWeblocFile', () => {
  it('reads the URL string from a plist', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>URL</key><string>https://example.org/a?b=1&amp;c=2</string></dict></plist>`
    expect(parseWeblocFile(plist)).toBe('https://example.org/a?b=1&c=2')
    expect(parseWeblocFile('<plist><dict></dict></plist>')).toBeUndefined()
  })
})

describe('validateTarget', () => {
  it('accepts http(s) only', () => {
    expect(validateTarget('https://plato.stanford.edu/')).toMatchObject({ ok: true, hostname: 'plato.stanford.edu' })
    expect(validateTarget('http://example.com')).toMatchObject({ ok: true, url: 'http://example.com/' })
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///C:/Windows/win.ini', 'ftp://x.example/', 'mailto:a@b.c', 'notaurl', '', undefined]) {
      expect(validateTarget(bad).ok, String(bad)).toBe(false)
    }
  })

  it('rejects credentials and over-long URLs', () => {
    expect(validateTarget('https://user:pw@example.com/')).toMatchObject({ ok: false, reason: 'URL contains credentials' })
    expect(validateTarget('https://user@example.com/').ok).toBe(false)
    expect(validateTarget('https://example.com/' + 'a'.repeat(2048)).ok).toBe(false)
    expect(validateTarget('https://example.com/' + 'a'.repeat(2000)).ok).toBe(true)
  })

  it('handles IDN hostnames (stored as punycode, shown as Unicode)', () => {
    const r = validateTarget('https://bücher.example/philosophie')
    expect(r).toMatchObject({ ok: true, hostname: 'xn--bcher-kva.example' })
    expect(displayDomain('https://www.xn--bcher-kva.example/')).toBe('bücher.example')
    expect(displayDomain('https://www.plato.stanford.edu/')).toBe('plato.stanford.edu')
  })
})

describe('scanLibrary with website books', () => {
  it('adds valid links, skips rejected ones with a warning, reads embed from the sidecar', async () => {
    const t = await makeTree({
      books: {
        '01-web': {
          'SEP - Stanford Encyclopedia of Philosophy.url': '[InternetShortcut]\r\nURL=https://plato.stanford.edu/\r\n',
          'SEP - Stanford Encyclopedia of Philosophy.url.meta.json': '{"embed": "iframe"}',
          'Internet Encyclopedia of Philosophy.url': `${BOM}[InternetShortcut]\nURL=https://www.iep.utm.edu/\n`,
          'Mac Link.webloc': '<plist><dict><key>URL</key><string>https://example.org/</string></dict></plist>',
          'Evil.url': '[InternetShortcut]\nURL=javascript:alert(document.cookie)\n',
          'Data.url': '[InternetShortcut]\nURL=data:text/html;base64,PHNjcmlwdD4=\n',
          'Local.url': '[InternetShortcut]\nURL=file:///C:/secret.txt\n',
          'Creds.url': '[InternetShortcut]\nURL=https://admin:hunter2@example.com/\n',
          'Long.url': `[InternetShortcut]\nURL=https://example.com/${'x'.repeat(3000)}\n`,
          'Empty.url': '[InternetShortcut]\nIconIndex=0\n',
          'Bad embed.url': '[InternetShortcut]\nURL=https://bad-embed.example/\n',
          'Bad embed.url.meta.json': '{"embed": "popup", "title": "Renamed"}',
          'IDN.url': '[InternetShortcut]\nURL=https://bücher.example/\n',
        },
      },
      music: {},
    })
    try {
      const { library, warnings } = await scanLibrary({ booksDir: path.join(t.root, 'books'), musicDir: path.join(t.root, 'music') })
      const books = library.shelves[0]!.books
      const byId = Object.fromEntries(books.map((b) => [b.id.split('/')[1], b]))
      expect(Object.keys(byId).sort()).toEqual(['Bad embed.url', 'IDN.url', 'Internet Encyclopedia of Philosophy.url', 'Mac Link.webloc', 'SEP - Stanford Encyclopedia of Philosophy.url'])
      expect(byId['SEP - Stanford Encyclopedia of Philosophy.url']).toMatchObject({
        format: 'url', title: 'Stanford Encyclopedia of Philosophy', author: 'SEP', target: 'https://plato.stanford.edu/', embed: 'iframe',
      })
      expect(byId['Internet Encyclopedia of Philosophy.url']).toMatchObject({ author: 'iep.utm.edu', embed: 'auto', target: 'https://www.iep.utm.edu/' })
      expect(byId['Mac Link.webloc']).toMatchObject({ format: 'url', author: 'example.org', title: 'Mac Link' })
      expect(byId['Bad embed.url']).toMatchObject({ embed: 'auto', title: 'Renamed' })
      expect(byId['IDN.url']).toMatchObject({ author: 'bücher.example', target: 'https://xn--bcher-kva.example/' })
      for (const name of ['Evil.url', 'Data.url', 'Local.url', 'Creds.url', 'Long.url', 'Empty.url']) {
        expect(warnings.some((w) => w.includes(name) && w.includes('link rejected')), name).toBe(true)
      }
      const json = JSON.stringify(library)
      expect(json).not.toMatch(/javascript:|data:text|file:|hunter2/)
    } finally {
      await t.cleanup()
    }
  })
})

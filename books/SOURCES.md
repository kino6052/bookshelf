# Seed library sources

Every seed book is a public-domain work. Licence status was checked on each Project Gutenberg
ebook page ("Copyright Status: Public domain in the USA") on 2026-10-04. Works were looked up by
title in the official catalogue (`https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv`).

Rebuild with `node scripts/seed/build-seed.mjs <cache-dir>` after downloading the files named in that script.
This file is ignored by the scanner (files directly in `books/` are never books).

| File | Work | Author / translator | Source | Licence | Notes |
|---|---|---|---|---|---|
| `01-ancient/Plato - Apology.md` | Apology | Plato, tr. Benjamin Jowett | [PG #1656](https://www.gutenberg.org/ebooks/1656) | Public domain in the USA | Converted to Markdown by `scripts/seed/build-seed.mjs`; Gutenberg header/footer removed |
| `01-ancient/Plato - The Republic.epub` | The Republic | Plato, tr. Benjamin Jowett | [PG #1497](https://www.gutenberg.org/ebooks/1497) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `01-ancient/Aristotle - The Nicomachean Ethics.txt` | The Nicomachean Ethics | Aristotle, tr. F. H. Peters | [PG #8438](https://www.gutenberg.org/ebooks/8438) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `02-medieval/Augustine - The Confessions.epub` | The Confessions | Augustine of Hippo, tr. E. B. Pusey | [PG #3296](https://www.gutenberg.org/ebooks/3296) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `02-medieval/Boethius - The Consolation of Philosophy.txt` | The Consolation of Philosophy | Boethius, tr. H. R. James | [PG #14328](https://www.gutenberg.org/ebooks/14328) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `02-medieval/Aquinas - Summa Theologica, Part I.epub` | Summa Theologica, Part I (Prima Pars) | Thomas Aquinas, tr. Fathers of the English Dominican Province | [PG #17611](https://www.gutenberg.org/ebooks/17611) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `03-rationalists/Descartes - Discourse on the Method.pdf` | Discourse on the Method | René Descartes, tr. John Veitch | [PG #59](https://www.gutenberg.org/ebooks/59) | Public domain in the USA | Typeset to PDF by `scripts/seed/build-seed.mjs`; Gutenberg header/footer removed |
| `03-rationalists/Spinoza - Ethics, Part I.epub` | Ethics — Part 1 | Benedict de Spinoza, tr. R. H. M. Elwes | [PG #919](https://www.gutenberg.org/ebooks/919) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `04-empiricists/Locke - An Essay Concerning Humane Understanding, Volume 1.txt` | An Essay Concerning Humane Understanding, Vol. 1 | John Locke | [PG #10615](https://www.gutenberg.org/ebooks/10615) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `04-empiricists/Berkeley - A Treatise Concerning the Principles of Human Knowledge.epub` | A Treatise Concerning the Principles of Human Knowledge | George Berkeley | [PG #4723](https://www.gutenberg.org/ebooks/4723) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `04-empiricists/Hume - An Enquiry Concerning Human Understanding.epub` | An Enquiry Concerning Human Understanding | David Hume | [PG #9662](https://www.gutenberg.org/ebooks/9662) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `05-kant-and-after/Kant - The Critique of Pure Reason.epub` | The Critique of Pure Reason | Immanuel Kant, tr. J. M. D. Meiklejohn | [PG #4280](https://www.gutenberg.org/ebooks/4280) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `05-kant-and-after/Kant - Fundamental Principles of the Metaphysic of Morals.pdf` | Fundamental Principles of the Metaphysic of Morals | Immanuel Kant, tr. Thomas Kingsmill Abbott | [PG #5682](https://www.gutenberg.org/ebooks/5682) | Public domain in the USA | Typeset to PDF by `scripts/seed/build-seed.mjs`; Gutenberg header/footer removed |
| `06-everything-else/Tolstoy - War and Peace.txt` | War and Peace | Leo Tolstoy, tr. Louise and Aylmer Maude | [PG #2600](https://www.gutenberg.org/ebooks/2600) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |
| `06-everything-else/Austen - Pride and Prejudice.epub` | Pride and Prejudice | Jane Austen | [PG #1342](https://www.gutenberg.org/ebooks/1342) | Public domain in the USA | Gutenberg file, unchanged (Project Gutenberg License included in the file) |

## Website books

| File | Target | Copy | Embedding |
|---|---|---|---|
| `04-empiricists/IEP - Internet Encyclopedia of Philosophy.url` | https://iep.utm.edu/ | link only (no content copied) | embeddable: no `X-Frame-Options` or CSP `frame-ancestors` when checked on 2026-10-04 → `embed: iframe` |
| `06-everything-else/SEP - Stanford Encyclopedia of Philosophy.url` | https://plato.stanford.edu/ | link only (no content copied) | embeddable: no `X-Frame-Options` or CSP `frame-ancestors` when checked on 2026-10-04 → `embed: iframe` |

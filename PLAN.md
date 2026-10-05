# Bookshelf: a walkable personal library

> **This file is the living plan.** It is both the brief and the progress tracker.
> Read §0 first, and keep this file current as you work.

## Status

| | |
|---|---|
| Current milestone | M3/M4 checks, then M5 |
| Next action | M3.3 touch, M3.6 list/fallback/axe, M4.6 errors, M4.7 website fixtures, M1.2 watcher, then M5 authoring |
| Blockers | none |
| Last updated | 2026-10-04 · walnut/brick/bay redesign, comic outlines, grain, Pages verified under a subpath |

---

## 0. Operating rules (read at the start of every session)

1. **This file is the single source of truth** for scope and progress. After any session start or context reset, re-read it in full and resume from *Status → Next action*.
2. **Checkbox legend:** `[ ]` todo · `[~]` in progress · `[x]` done **and verified** · `[!]` blocked · `[-]` dropped (keep the line and say why).
3. **Tick `[x]` only after the item's *Accept* check has passed**, and add a line to the Evidence log (§9) with the command, test name or screenshot path. "It compiles" is not done.
4. **Put discovered work on the checklist at once**, under the right milestone with a new ID. Never delete items.
5. **Log every decision** that fills a gap in, or deviates from, this document (§9, with date and reason). Prefer the defaults in §7 over asking.
6. **Functionality over looks.** Visual work is time-boxed to M2.7 and M8.4 (one pass each). Never trade a working feature for nicer rendering.
7. **Don't pause between milestones to ask.** Ask the owner only when blocked on something this file gives no default for. If an item is blocked, mark it `[!]`, record why, and move to the next unblocked item.
8. **Commit locally at the end of each milestone** (`feat(mN): …`), PLAN.md included. Never push. Never rewrite history.
9. **Stay in scope.** Anything not in this plan is added to the plan first. Ideas go to the parking lot (§9).
10. **Verify for real.** Run the app and drive it in a browser (Playwright preferred; the host's browser tool is fine for visual checks). Test both the dev server and the production build (`vite preview`): workers, authoring gating and base paths behave differently between them.

---

## 1. Vision

A small, bright, white, low-poly "university library" that you walk around in first person. Large windows flood it with sunlight and look out on a garden. Every book the owner has read stands on a shelf, and some "books" are websites. Click a book: it slides out, opens, and you read it (or visit it). The owner adds books from inside the scene (dev mode only) or by dropping files into a folder. Ambient music plays while you wander.

- **Audience:** the owner, and people they invite (read-only visitors on the deployed static site).
- **Feel:** cozy and fresh, minimal, slightly futuristic.
- **Priority:** reliable and functional first, pretty second.

## 2. Locked decisions (from the owner interview)

| # | Decision |
|---|---|
| D1 | The owner is the only author. The deployed site is read-only static. Authoring exists only on the local dev server and writes real files into the repo; the owner commits and pushes to publish. |
| D2 | A book is a static file: `.md`, `.txt`, `.pdf` or `.epub`, or a link file for a website book (D15). Opening a book fetches that file. |
| D3 | Clicking a book pulls it off the shelf with an animation, then an HTML reader (styled like an open book) takes over. |
| D4 | Folders are shelves. Each folder is one row (board) of a bookcase. A generated manifest drives the scene. |
| D5 | Ways to add a book: in-world "+" slot on each shelf, global "Add book" button, drag-and-drop onto a shelf, and dropping a file into a folder by hand (the scene updates live). |
| D6 | First-person walking: WASD + mouse-look (pointer lock) on desktop; virtual joystick + drag-look on touch. |
| D7 | Look: low-poly, flat-shaded (visible facets and edges), white dominant, minimal. Books and the garden supply the colour. Sun through large windows. **Visuals are secondary to functionality.** *(Supersedes the earlier "realistic / PBR" idea.)* |
| D8 | Stack: Three.js + Vite + TypeScript, vanilla DOM UI. |
| D9 | Outside the windows: garden, trees, soft hills. |
| D10 | Furniture is minimal: tables and stools, a university-library feel. |
| D11 | A book is just title + author + file. No notes, ratings or read-status. |
| D12 | Ambient music while walking is a core feature. |
| D13 | The owner mostly reads philosophy (Plato, Aristotle, Aquinas, Descartes, Spinoza, Berkeley, Hume, Kant…) plus everything else; visitors come to see what they have read. |
| D14 | This plan is a living checklist (§0). |
| D15 | Some books represent websites: a link file (`.url` / `.webloc`) instead of text. They stand on the shelf like books and open the site. *(Opening behaviour, look and authoring flow are defaults in §3 and §7.)* |

---

## 3. Specification

### 3.1 Content model

```
books/<shelf>/<file>.{md,txt,pdf,epub}      the books (repo root, not public/)
books/<shelf>/<name>.{url,webloc}           a website book: a link file (Windows .url or macOS .webloc)
books/<shelf>/shelf.json                    optional  {"title": "Rationalists", "order": 3}
books/<shelf>/<file>.<ext>.meta.json        optional  {"title": "", "author": "", "spineColor": "#rrggbb", "order": 1, "embed": "auto"}   (embed: website books only)
books/SOURCES.md                            ignored (files directly in books/ are never books)
music/<track>.{mp3,ogg,m4a,wav}             ambient tracks
```

The dev plugin serves `/books/*` and `/music/*` (with HTTP Range support) and the build copies both folders into `dist/`. Everything under them is public once deployed.

- A **shelf is an immediate sub-folder** of `books/`. Deeper folders are ignored with one console warning. An empty folder is a valid, empty shelf.
- **Shelf title:** `shelf.json.title`, else the folder name with a leading `NN-` removed, `-`/`_` turned into spaces, Title Case.
- **Shelf order:** `shelf.json.order`, else the leading `NN-` number, else after all numbered shelves, alphabetical. Ties: alphabetical.
- **Book metadata precedence:** `.meta.json` → md front-matter (`title`, `author`) → filename `Author - Title.ext` (split on the first ` - `) → humanized filename (title only).
- **Book order within a shelf:** `meta.order`, then author (case-insensitive, locale-aware), then title.
- **Ignored:** dotfiles, `Thumbs.db`, `desktop.ini`, `*.json` other than sidecars, `*.part`, `*.tmp`, `*.crdownload`, unknown extensions (warn once each).
- **Website books** (`format: 'url'`): a `.url` file is INI (`[InternetShortcut]` then `URL=…`; tolerate a BOM, CRLF/LF and any key case); a `.webloc` is a plist with the URL in a `<string>`. The destination goes in `target`. Only `http:`/`https:` targets with no embedded credentials and ≤ 2048 characters are accepted; anything else (`javascript:`, `data:`, `file:` …) is skipped with a warning, so it never reaches the client. `embed` comes from the sidecar (`auto` if absent). Author falls back to the hostname without `www.`. The owner can make one by dragging a link from the browser into a shelf folder.
- **Manifest** (`library.json`) comes from one pure function, `scanLibrary(dirs)`, used by both the dev server and the build. The client never scans.

```ts
type Format = 'md' | 'txt' | 'pdf' | 'epub' | 'url'
interface Book  { id: string; shelfId: string; url: string; format: Format; title: string; author?: string; spineColor?: string; bytes: number; mtime: number
                  target?: string; embed?: 'auto' | 'iframe' | 'link' }   // target/embed: format 'url' only
interface Shelf { id: string; title: string; order: number; books: Book[] }
interface Track { id: string; url: string; title: string }
interface Library { version: 1; shelves: Shelf[]; tracks: Track[] }
```

- `id` is `<shelfFolder>/<filename>` with `/` separators even on Windows. `url` is URL-encoded and relative to the page (`books/...`), with `?v=<mtime>` for cache-busting.
- The client treats the manifest as untrusted input: validate it, skip malformed entries with a warning, never crash the scene.

### 3.2 Room, look and layout

- Start with ~8 m × 10 m × 3.6 m (tunable in `src/config.ts`). The long south wall is mostly floor-to-ceiling windows with thin mullions. Sun comes in through them and throws patches of light across the floor.
- **Look:** low-poly with `flatShading` (visible facets and edges). Walls, ceiling, floor and furniture are white or very pale. No image textures (only procedural canvases for labels). No post-processing. One shadow-casting sun plus hemisphere fill, with tone mapping so whites don't clip. Books and the garden carry the colour.
- **Outside:** lawn, faceted trees with a gentle sway, soft hills, a sky gradient and a few slow low-poly clouds.
- **Furniture** (low-poly, white or light grey, with colliders): two long reading tables with stools, a low reading corner by the windows (two chairs, a side table), a few potted plants. Empty space is intentional.
- **Layout engine** (pure, deterministic, unit-tested: `layout(library, opts) → placements`):
  - A board is ~1.0 m wide (≈ 25–30 average books). Bookcases have 5 levels (lowest ≈ 0.25 m, top ≤ 2.1 m). Every book must be clickable.
  - A shelf occupies as many **consecutive boards** as its books need, in reading order (left → right, then the next wall or stack), with a name plate at its start. Never drop or hide a book.
  - Fill the perimeter walls first (not the window wall), then freestanding double-sided stacks down the middle of the room, **growing the room's length** as needed (aisles ≥ 1.2 m).
  - In authoring mode, reserve one extra book-width after the last book of every shelf for the "+" slot.
  - Book size is deterministic from its id and file size: thickness 1.5–6 cm (bytes-scaled, clamped), height 20–30 cm, depth 15–22 cm. Spine colour: sidecar `spineColor`, else hashed into a muted palette (deep blue, burgundy, forest, ochre, charcoal, cream, teal, terracotta). Never use unseeded `Math.random()`: reloads must look identical.
  - **Website books** look like slim books so they are recognisable at a glance: ~1 cm thick (not size-scaled), a small globe glyph at the top of the spine, the domain printed under the title; the opened cover shows title + domain.
  - Adding a book moves only the books after it in the same shelf, plus later shelves if boards re-flow.

### 3.3 Player and interaction

- **Desktop:** an "Enter" overlay, then pointer lock. WASD/arrows walk at 1.4 m/s (Shift 2.4 m/s), mouse-look with pitch clamped to ±85°, eye height 1.65 m.
- **Unlocked state (Esc) is not a dead state.** Show a slim top bar (Resume · Music · List · Help), not a full-screen blocker. The cursor is free: hover, click and drag-and-drop use the cursor ray; WASD still works; clicking empty scene re-locks. (File drag-and-drop cannot work under pointer lock.)
- **Touch:** left-half virtual joystick, right-half drag-look, tap (≤ 10 px movement, ≤ 300 ms) on a book to open it. No pointer lock.
- **Collision:** circle (r = 0.3 m) against AABB colliders in XZ, with sliding. You can't leave the room, pass through furniture, or enter bookcases. No physics engine.
- **Interaction ray:** one function that takes a ray source (screen centre | cursor | touch point). Max reach 3 m. A hovered book gets a visible highlight (e.g. lifts 1 cm and tints) and a label "Title — Author" (website books: "Title — domain ↗"). Click or `E` opens it.
- **HUD:** crosshair (desktop, locked), hover label, Music (mute + volume), List view, Help. Authoring only: Add book.
- **List view (also the fallback):** an HTML list of all shelves and books with a filter box. It opens any book in the reader (website books are marked ↗ with their domain), and "Locate" glides the camera to the book. If WebGL2 is unavailable or the context can't be created, the site opens in List view with a notice.
- Respect `prefers-reduced-motion` (no sway or dust; tweens skipped or shortened).

### 3.4 Opening books and the reader

- State machine `idle → pulling → reading → returning → idle`. Esc/close mid-animation, rapid clicks, and library updates while reading must never leave a bad state. (A book that is removed while open simply disappears on close.)
- Animation (~0.7 s each way): the book's instance is hidden and a standalone detailed mesh takes over, slides out, travels to ~0.6 m in front of the camera and opens (the front cover hinges). The reader overlay fades in over a dimmed scene. Closing reverses it and the book slides back into its slot.
- **Reader** (DOM overlay: `role="dialog"`, focus trap, Esc closes, title/author bar, progress, TOC when available, font-size controls, last position remembered per book in `localStorage`):

| Format | How it is rendered |
|---|---|
| md | markdown-it or marked → DOMPurify → scrolled typographic column (~65ch); front-matter stripped; TOC from headings |
| txt | paragraphs split on blank lines, same typography; chunked rendering so multi-MB Gutenberg files stay smooth |
| pdf | `pdfjs-dist`, lazy-loaded; virtualized page canvases; fit-width and zoom; page jump. The worker must work in dev **and** in the production build |
| epub | `epubjs`, lazy-loaded; fetched as an `ArrayBuffer`; TOC; prev/next; font size; scripts disabled |
| url | **Website mode** (below): the site in a sandboxed iframe when embedding is allowed, otherwise a site card with "Open in new tab ↗" |

- Reader libraries load only when a book of that format is opened. The book file is fetched on open and aborted on close.
- States: loading (with progress if known), error ("Couldn't open this book" + Retry), empty file.
- **Website mode (format `url`):** the reader shows a toolbar (domain, Reload, "Open in new tab ↗", Copy link), then:
  - `embed: iframe` → the site in a sandboxed `<iframe>` (`sandbox` with scripts, same-origin, forms and popups only, **never** `allow-top-navigation`; `referrerpolicy="no-referrer"`).
  - `embed: link` → a site card (title, domain, full URL, a large "Open in new tab ↗" button). No iframe is created.
  - `embed: auto` (manual drops, no probe) → try the iframe, keep "Open in new tab ↗" prominent, and show an inline hint ("Site not showing? Some sites refuse to be embedded.") after 8 s.
  - An `http:` target on an `https:` page can't be embedded (mixed content): force the card.
  - Outbound links always use `target="_blank" rel="noopener noreferrer"`. The library never navigates away from itself.
  - **Privacy:** nothing from a third-party site is requested until the visitor opens that book (no prefetch, favicons or previews on the shelf).

### 3.5 Authoring

Dev server only. **The production build contains none of it.**

- The dev plugin injects a random per-run token into `index.html` (`<meta name="author-token">`). Its presence is what enables the authoring UI. All `/__author/*` requests require header `X-Author-Token` and a localhost `Host`/`Origin`.
- `PUT /__author/book?shelf=<id>&filename=<name>[&title=&author=&spineColor=]`: the body is the raw file, **streamed** to `*.part` and then atomically renamed. Validate: extension whitelist (`md`, `txt`, `pdf`, `epub`, `url`, `webloc`); sanitized filename (no path separators, control chars, reserved Windows names or trailing dots); shelf exists; size ≤ 250 MB (configurable); never overwrite (append ` (2)`). Write `<file>.meta.json` only if title, author or spineColor were provided. Return the Book record.
- `POST /__author/shelf {title}`: creates a collision-safe slug folder plus `shelf.json {title, order: max+1}`.
- **Website books:** `POST /__author/link {shelf, url, title?, author?, embed?}` writes `<Site - Title>.url` (`[InternetShortcut]` / `URL=…`), plus a sidecar when title, author or embed differ from the defaults. `GET /__author/probe?url=…` returns `{title, siteName, embeddable}` to pre-fill the panel: it fetches the page server-side (10 s timeout, ≤ 1 MB read, `http(s)` only, **refuses localhost, private and link-local addresses, including via redirects**) and derives `embeddable` from `X-Frame-Options` and CSP `frame-ancestors`. The panel stores `embed: iframe` if embeddable, else `link`. The SSRF guard has a test-only allow-list so hermetic tests can use a local fixture server.
- Errors are `{error}` JSON with a 4xx status; the UI shows them.
- **Watcher:** watches `books/` and `music/` (add/change/unlink). It waits for file size to be stable (~500 ms) so big manual copies aren't read half-written, debounces, regenerates the manifest and pushes the custom HMR event `bookshelf:library`. The client refetches and **diffs**: no page reload, player position preserved, new books drop in, removed books fade out.
- **Add Book panel:** shelf dropdown (+ "New shelf…" inline); two modes, **File** (picker and drop zone, multi-file) and **Website** (URL field → probe → editable title, author and embed mode); per-file title/author auto-detected client-side (md front-matter or first `#` heading; epub OPF; pdf metadata; txt first line; else the filename convention) and editable; optional spine colour; upload progress; errors; confirm before discarding pending files.
- **"+" slot:** a translucent book-shaped ghost at the end of every shelf, with hover highlight. Click or `E` opens the panel preset to that shelf.
- **Global "Add book"** button in the HUD.
- **Drag-and-drop onto the scene:** the shelf under the cursor highlights while dragging. Dropping opens the panel with the files loaded and that shelf selected. Dropped links (dragged from the address bar or a page) open the panel in Website mode. Non-book files are rejected with a message.
- After a successful add: a toast, the book drops in and pulses for ~2 s, and "Locate" glides the camera to it. Manual folder drops give the same live result without the toast.
- Not in the UI: delete, rename, move (use the filesystem; the watcher handles it).

### 3.6 Audio

- Tracks are any `mp3/ogg/m4a/wav` in `music/`, listed in the manifest. The owner supplies them; never ship copyrighted music.
- Playback starts at the first user gesture (Enter click or first touch) to satisfy autoplay policy. Random start track, shuffled loop, 4 s cross-fade, never two tracks audibly overlapping beyond the fade.
- Controls: mute toggle + volume slider (HUD and pause bar); `M` toggles mute; volume and mute persist in `localStorage`; a tiny "now playing" label (title from the filename).
- Pauses when `document.hidden`; ducks to ~40 % while the reader is open; resumes cleanly. On iOS/Safari, unlock audio on touch.
- **No tracks present →** procedural generative ambient (Web Audio: slow detuned pads on a calm scale, filtered noise, algorithmic reverb) so the feature works with zero assets.
- A missing or corrupt track is skipped with one log line; audio code never throws into the render loop.

### 3.7 Budgets and robustness

| Area | Budget / rule |
|---|---|
| Draw calls | ≤ 200 in any view (merge static geometry; instance the books) |
| Triangles | ≤ ~300k visible |
| GPU texture memory | ≤ ~64 MB. Spine and plate labels are generated lazily near the player and evicted or LOD'd when far |
| First-load JS | ≤ ~700 KB gzip, excluding lazy chunks. pdf.js, epub.js and markdown load only on demand |
| Frame rate | 60 fps on an integrated GPU at 1080p; ≥ 30 fps on a mid-range phone. Dynamic resolution (pixel ratio 0.6 → min(devicePixelRatio, 2)) driven by frame time |
| Scale | `?stress=500` stays within all of the above (measure with `renderer.info`, not headless FPS). *(Was 1000; the owner's library is at most 300–500 books.)* |
| Browsers | latest Chrome, Edge, Firefox, Safari; iOS Safari; Android Chrome |

Must handle: resize and orientation change; WebGL context loss/restore; hidden tab (pause the loop and audio); 0 books; 1 book; an empty shelf; very long titles (shrink-to-fit or ellipsis on the spine, full text in the hover label); Unicode titles (Greek, Latin, CJK); duplicate titles; `localStorage` unavailable (try/catch, the app still works); a bad book never crashes the scene.

### 3.8 Engineering conventions

- Vite + TypeScript `strict`, ES modules, Node ≥ 20, **pnpm** (owner, 2026-10-05; was npm). The owner is on **Windows 11 + PowerShell**: no bash-only scripts, use `node:path`, expect `\` separators on disk and `/` in URLs.
- Preferred libraries (substitute only with a Decisions-log note): `three`, `markdown-it` (or `marked`) + `dompurify`, `pdfjs-dist`, `epubjs`. Dev: `vitest`, `@playwright/test`, `@axe-core/playwright`.
- Pure logic (scanner, filename parsing, layout, manifest diff, playlist, upload validation) lives in three.js-free modules with unit tests.
- Test hook `window.__bookshelf` (player pose, hovered book, layout info, `renderer.info`, teleport and select commands), exposed only in dev and in builds made with `VITE_E2E=1`.
- Content dirs are overridable via `BOOKSHELF_BOOKS_DIR` and `BOOKSHELF_MUSIC_DIR`, so tests never touch the real library.
- `vite.config`: `base: './'` (works at a domain root or a subpath); emit `library.json`.
- Comments only where the *why* isn't obvious. Small modules. No `any` without a reason.
- **Known hazards, test early:** pdf.js worker URL and `build.target` (top-level await); epub.js with `ArrayBuffer` input; Windows path separators and URL-encoding (spaces, `#`, `%`, `&`, Unicode); pointer lock and audio both need a user gesture; headless Chromium needs software-GL flags for WebGL (e.g. `--use-angle=swiftshader --enable-unsafe-swiftshader`; fall back to headed if flaky); Vite may full-reload on content changes (suppress it for `books/` and `music/`); shadow light-leaking at wall/floor seams.

---

## 4. Milestones and checklist

### M0 · Bootstrap
*Goal: a blank Three.js scene runs in dev and in the production build; tooling works on Windows.*
- [x] **M0.1** Vite + TypeScript (strict) + three. Scripts `dev`, `build`, `preview`, `typecheck`, `test`, `e2e`. `.gitignore`; `.gitattributes` (`* text=auto`; pdf/epub/audio binary); `src/config.ts`; `base: './'`.
  *Accept:* `npm run build && npm run preview` serves a rotating cube.
- [x] **M0.2** Vitest + ~~Playwright (Chromium, software-GL flags)~~ a browser-pane smoke check against `vite preview` *(Playwright dropped by the owner, see Decisions log)*.
  *Accept:* `npm test` passes; the smoke check passes in the built-in browser; screenshot at `docs/verification/m0-smoke.png`.

### M1 · Library pipeline (no 3D)
- [x] **M1.1** `scanLibrary()` + fixtures + unit tests (§3.1).
  *Accept:* tests cover ordering, metadata precedence, ignored files, names with spaces/Unicode/`#`/`%`/`&`, empty shelf, bad sidecar JSON, one-level-only folders, root-level files ignored.
- [~] **M1.2** Vite plugin: dev serves `/library.json`, `/books/*`, `/music/*` (Range support); watcher with stable-size wait, debounce and the `bookshelf:library` HMR event; build emits `library.json` and copies both folders to `dist/`.
  *Accept:* with `npm run dev` running, copying a large PDF into a shelf updates `/library.json` once, only after the copy completes, with no full page reload; `dist/` contains the books and the manifest.
- [x] **M1.3** Client loader: fetch, validate, diff (added / removed / changed) + tests.
- [x] **M1.4** Seed library (§8).
  *Accept:* ≥ 4 shelves, ≥ 10 books, all four formats; every file opens directly in a browser tab via its manifest URL.
- [x] **M1.5** `?stress=N` synthetic library (dev and e2e builds only).
  *Accept:* N = 0, 1, 30, 300, 1000 give valid manifests.
- [x] **M1.6** Website books in the scanner and manifest (§3.1): `.url` / `.webloc` parsing, http(s)-only target validation, domain-as-author fallback, `embed` from the sidecar. Extend `?stress=N` so ~10 % of synthetic books are website books.
  *Accept:* unit tests: BOM, CRLF/LF, odd key case, missing `URL=`; `javascript:` / `data:` / `file:` / credentials-in-URL / over-long URLs rejected with a warning; IDN hostnames; a rejected link never appears in the manifest.
- [x] **M1.7** Seed website books (§8).
  *Accept:* ≥ 2 website books on different shelves, each with a valid `target`.

### M2 · Scene and layout
- [x] **M2.1** Renderer, loop, resize, dynamic resolution, context loss/restore, pause when hidden.
- [x] **M2.2** Room shell: floor, walls, ceiling, window openings with mullions (§3.2).
- [x] **M2.3** Sun + shadows through the windows, hemisphere fill, sky, garden (lawn, swaying trees, hills, clouds).
  *Accept:* screenshots from 3 fixed poses show sun patches on the floor and the garden through the windows; whites aren't clipped.
- [x] **M2.4** Layout engine + tests (§3.2).
  *Accept:* for 0 / 1 / 30 / 300 / 1000 books: deterministic, no overlaps, no dropped books, aisles ≥ 1.2 m, authoring reserve honoured.
- [x] **M2.5** Bookcases, name plates, spines (instancing + lazy label textures; long-title fit; Unicode).
  *Accept:* `?stress=500` (was 1000) meets the §3.7 budgets by `renderer.info`.
- [x] **M2.6** Furniture, plants, colliders.
- [ ] **M2.7** One time-boxed visual pass: light balance, palette, tidy composition. *(Optional: thin emissive light strips for the "futuristic" feel.)*
- [x] **M2.8** Website-book spines and covers (§3.2): slim, globe glyph, domain line. *(Functional: recognisability, not polish.)*
  *Accept:* `?stress=500` (was 1000; ≈ 10 % website books) still meets the §3.7 budgets; a screenshot shows website books are distinguishable from paper books at a glance.
- [x] **M2.9** Owner's room brief (2026-10-05): the whole north wall is the bookcase (closed cabinets below, three open boards so books sit between 1.0 m and ~2.1 m), cozy items on free shelf space, paintings on the side walls, venetian blinds with the sun striping the floor and walls, misty garden behind frosted glass. Room design otherwise kept minimal.
  *Accept:* screenshots show all of it; layout tests assert every book's bottom ≥ 1.0 m and top ≤ 2.1 m.

### M3 · Player and interaction
- [x] **M3.1** Enter overlay (title, controls, loading progress, load errors) and Help.
- [ ] **M3.2** Desktop controls, unlocked state (§3.3), collisions.
  *Accept:* e2e via `__bookshelf`: walking into a bookcase, a table and a wall never penetrates; sliding works.
- [ ] **M3.3** Touch controls.
  *Accept:* Playwright touch emulation: the joystick moves the player; a tap on a book opens it; a drag doesn't.
- [x] **M3.4** Interaction ray (centre / cursor / touch), hover highlight + label, `E`/click select; works on instanced books.
  *Accept:* e2e: teleport next to a book → hovered id and label match the manifest.
- [ ] **M3.5** HUD (crosshair, music, list, help).
- [ ] **M3.6** List view (filter, open, Locate) + no-WebGL fallback.
  *Accept:* e2e with WebGL disabled lands in List view and can open a book; axe reports no critical violations.

### M4 · Opening books and the reader
- [ ] **M4.1** State machine + pull-out/return animation (+ reduced-motion variant).
  *Accept:* e2e: rapid clicks and Esc mid-animation end in a consistent state; the book is back in its slot.
- [x] **M4.2** Reader shell (dialog, focus trap, Esc, loading/error/abort, progress, TOC, font size, remembered position).
- [~] **M4.3** md + txt readers (sanitized, chunked).
  *Accept:* `<script>` and `onerror` in markdown are neutralised (test); a 5 MB txt opens without a long task over 200 ms.
- [x] **M4.4** pdf reader.
  *Accept:* opens the seed PDF in dev **and** `vite preview`; page jump works.
- [x] **M4.5** epub reader.
  *Accept:* opens the seed EPUB in dev **and** `vite preview`; TOC navigation works.
- [ ] **M4.6** Error paths: missing, corrupt and zero-byte files.
  *Accept:* a friendly error is shown and the scene keeps working.
- [ ] **M4.7** Website mode in the reader (§3.4): toolbar, sandboxed iframe, site card, mixed-content rule, no prefetch; hover label and List view mark website books.
  *Accept:* hermetic e2e with local fixture servers: an embeddable fixture shows in the iframe under the toolbar; a fixture sending `X-Frame-Options: DENY` with `embed: link` shows the card and creates no iframe; "Open in new tab ↗" has `target="_blank" rel="noopener noreferrer"`; the iframe has no `allow-top-navigation`; zero requests reach a website book's host before it is opened.

### M5 · Authoring (dev only)
- [ ] **M5.1** Authoring API + security tests (§3.5).
  *Accept:* tests for `../` and absolute paths, wrong or missing token, foreign Origin/Host, oversized body, disallowed extension, name collision, Windows reserved names.
- [ ] **M5.2** Add Book panel (auto-detect, new shelf, progress, errors).
- [ ] **M5.3** "+" slots and the global "Add book" button.
- [ ] **M5.4** Drag-and-drop onto a shelf (multi-file).
- [ ] **M5.5** Live diff updates (drop-in / fade-out), toast, pulse, Locate.
- [ ] **M5.6** Production gating.
  *Accept:* `dist/` has no authoring code or `__author` strings; `vite preview` shows no authoring UI and the endpoints 404.
- [ ] **M5.7** e2e for every add path (panel, "+" slot, button, drag-and-drop, manual folder drop) against a temp content dir; the seed library is never modified.
- [ ] **M5.8** Authoring for website books (§3.5): `POST /__author/link`, `GET /__author/probe` with the SSRF guard, Website mode in the Add Book panel, dropped links.
  *Accept:* tests: localhost / private / link-local / IPv6-loopback / redirect-to-private refused; `file:` and `javascript:` refused; the probe sets `embed` correctly from `X-Frame-Options` and CSP `frame-ancestors` (local fixture + test allow-list); the written `.url` round-trips through `scanLibrary()`.
- [ ] **M5.9** e2e for the website-book add paths: panel URL, dropped link, dropped `.url` file, manual `.url` folder drop (temp content dir).

### M6 · Ambient music
- [ ] **M6.1** Track manifest + player: shuffled loop, 4 s cross-fade, volume/mute (persisted), `M` key, pause when hidden, duck while reading, skip bad tracks. Unit tests for the playlist logic.
- [ ] **M6.2** Procedural ambient fallback when `music/` has no tracks.
- [ ] **M6.3** Gesture unlock incl. iOS Safari; start on Enter / first touch.
  *Accept:* e2e (autoplay flag): audio is playing after Enter; mute persists across reload; with an empty `music/` the fallback produces audio (AudioContext running).
- [ ] **M6.4** `music/README.txt` explaining how to add tracks (the owner supplies their own).

### M7 · Hardening
- [ ] **M7.1** Budgets (§3.7) verified with `?stress=500`; bundle size report; lazy chunks confirmed.
- [ ] **M7.2** Robustness matrix (§3.7): every case has a test or a logged manual check.
- [ ] **M7.3** Accessibility pass on the DOM UI: axe clean (no critical/serious); keyboard-only walkthrough List view → reader → close.
- [ ] **M7.4** Reduced motion honoured everywhere.

### M8 · Docs and release prep
- [ ] **M8.1** README: the ways to add books (including website books: drag a link into a shelf folder), naming conventions, folder layout, adding music, run/build/test, deploy, and a **copyright warning** (everything in `books/` and `music/` is public once deployed), troubleshooting.
- [x] **M8.2** `base: './'` verified under a subpath (serve `dist/` at `/bookshelf/`).
- [~] **M8.3** `.github/workflows/pages.yml` builds and deploys `dist/` to GitHub Pages on every push to `main` (inert until pushed and Pages → Source is set to "GitHub Actions"). *(No longer optional: owner requirement 2026-10-05.)*
- [ ] **M8.4** One final visual polish pass; refresh screenshots in `docs/verification/`.
- [ ] **M8.5** Full verification run from a clean clone (`npm ci` + every command in §5). Set Status to DONE and write the owner-facing summary: what was built, the assumptions in §7, how to add books.

---

## 5. Verification

| Command | Proves |
|---|---|
| `pnpm run typecheck` | strict TypeScript is clean |
| `pnpm test` | unit tests: scanner, layout, diff, playlist, upload validation, sanitizer |
| `pnpm run build && pnpm run preview` | the production build works at the root; `node scripts/serve-subpath.mjs` serves it under `/bookshelf/` like GitHub Pages |
| Browser-pane checks | smoke, movement and collisions, hover/select, reader × 4 formats + website mode, List view, music, authoring (dev server + temp content), production gating — run through `window.__bookshelf`, results in the Evidence log (no Playwright, see Decisions) |

**Definition of done:** every non-optional item is `[x]`; `pnpm install --frozen-lockfile && pnpm run typecheck && pnpm test && pnpm run build` is green from a clean clone and the browser-pane checks pass; Status is DONE; the owner-facing summary is written in §9.

## 6. Out of scope (v1)

Per-book notes, ratings or read-status · in-book search · accounts, multiplayer, any backend · delete/rename/move via the UI · cover images (procedural spines and covers only) · archived or reader-mode copies of websites (links and embeds only) · favicons, screenshots or previews on website books · link-rot checking · realistic PBR, post-processing, bloom, volumetrics · time-of-day cycle · VR/AR · 3D page-flip · analytics · i18n.

## 7. Assumptions (the owner never specified these; proceed with them and override freely)

1. **Music:** owner-supplied tracks in `music/`; shuffled loop with cross-fade; starts on Enter; mute/volume UI; ducks to ~40 % in the reader; procedural fallback when empty.
2. **Scale:** the owner's library is **50–300 books** (owner, 2026-10-04). `?stress=1000` stays as the §3.7 robustness/budget test only; previews use the seed library (or `?stress=150`).
3. **Furnishings:** as in §3.2 (two tables with stools, a small window corner, a few plants).
4. **Hosting:** any static host; GitHub Pages-compatible via relative paths.
5. **Site title:** "Library", set in `src/config.ts`.
6. **Book sort order:** author, then title.
7. **Seed books** stay in the repo; the owner deletes or replaces them.
8. **Git:** local commits per milestone, no push.
9. **Reader:** scroll-based for md/txt; epub paginated if stable, else scrolled.
10. **Authoring UI** is desktop-only and dev-only; mobile authoring is not a goal.
11. **Website books:** opening one shows the live site in a sandboxed iframe inside the reader when embedding is allowed (decided by an authoring-time probe; manual `.url` drops default to `auto`), otherwise a site card with "Open in new tab ↗". Slim spine with a globe glyph and the domain; author defaults to the domain. No archived copies.

## 8. Seed library

- **Public-domain only.** Verify each work's licence (Project Gutenberg, Standard Ebooks, Wikisource). Look works up by title; **don't trust catalogue IDs from memory.** Record source URL and licence in `books/SOURCES.md`.
- Shelves mirror the owner's reading: `01-ancient` (Plato, Aristotle), `02-medieval` (Augustine, Boethius, Aquinas if a public-domain translation exists), `03-rationalists` (Descartes, Spinoza, Leibniz), `04-empiricists` (Locke, Berkeley, Hume), `05-kant-and-after`, `06-everything-else` (one or two classic novels).
- Mix all four formats. Include a txt over 3 MB (exercises chunked rendering), a multi-chapter EPUB with a TOC, a multi-page PDF, and an md with front-matter and headings. Total ≤ 20 MB.
- Add **at least two website books** as `.url` files on different shelves (e.g. the Stanford Encyclopedia of Philosophy and the Internet Encyclopedia of Philosophy). They are links, not copies, so there is no licence issue. Verify each loads and record whether it allows embedding.
- If offline: synthesise clearly labelled "Sample" files (generate a valid PDF and EPUB by script) so every code path stays testable, and log it.

## 9. Logs

### Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-10-04 | Plan created; D1–D14 locked; §7 assumptions set | Owner interview |
| 2026-10-04 | Added website books (D15): link files, slim spine, reader website mode, authoring probe. Opening behaviour is a default (§7.11) | Owner request after the plan was drafted; opening behaviour not yet specified |
| 2026-10-04 | **No Playwright.** Every "e2e" acceptance check is run in the host's built-in browser pane (dev server and `vite preview`), driving the app through `window.__bookshelf` and dev-only in-app self-tests (`__bookshelf.selftest(name)`). Axe runs by injecting `axe-core` into the page. There is no `npm run e2e`; results go in the Evidence log. `@playwright/test` and `@axe-core/playwright` are not dependencies | Owner instruction during M0 ("don't use playwright - just use your own api") |
| 2026-10-04 | Screenshots of the 3D view are saved by a dev-server-only endpoint (`POST /__verify/snapshot`, called from `__bookshelf.snapshot(name)`) that writes the canvas to `docs/verification/<name>.png`. DOM-only states are described in the Evidence log | The browser pane's screenshots aren't files on disk; §0.3 wants screenshot paths |
| 2026-10-04 | Toolchain: Vite 8, TypeScript 7, Vitest 5, three r186 (latest at bootstrap) | Latest stable releases; nothing in §3.8 pins versions |
| 2026-10-04 | Dev and preview servers bind to `127.0.0.1` (launch configs and `preview:e2e`) | Vite bound only to `::1` on this machine and the browser pane couldn't reach it |
| 2026-10-04 | Seed: Descartes is *Discourse on the Method* (no English *Meditations* in the PG catalogue); no Leibniz (no English *Monadology* on PG). Both PDFs are typeset from PG text by `scripts/seed/pdf.mjs` (Times, WinAnsi, /Info title+author) | §8 asks for a multi-page PDF; PG has no PDFs of these works |
| 2026-10-04 | Books with no author sort after books with one (within the same meta.order) | §3.1 doesn't say where authorless books go |
| 2026-10-04 | Shelving order: boards fill top → bottom within a section, sections left → right along a run (standard library shelving). Runs: west wall (S→N), north wall (W→E), east wall (N→S), then stacks (west face N→S, east face S→N). Stacks are added only when the walls are full; the room grows one stack pitch at a time after that | §3.2 gives "left → right, then the next wall or stack" but not the order of boards within a bookcase |
| 2026-10-04 | Owner asked to go straight to the 3D scene; remaining M1.2 checks (watcher + dist) are deferred, not dropped | Owner instruction 2026-10-04 |
| 2026-10-04 | Website books default to one pale-blue binding (`config.book.websiteColor`) instead of the hashed palette (a sidecar `spineColor` still wins) | At 1 cm thick a hashed colour made them indistinguishable from thin paper books; M2.8 requires recognisability at a glance |
| 2026-10-04 | Labels use two texture atlases (spines 2048² with 512 slots of 32×256 px, plates 1024² with 64 slots) filled lazily within 9 m of the player via `copyTextureToTexture`, drawn on instanced quads (one draw call each) | Keeps §3.7 draw-call and texture budgets at 1000 books |
| 2026-10-04 | Bookcases are built only as needed: `ceil(boards / 5) + 1` sections (min 2), in fixed slots so growth never moves standing sections. Wall order changed to north (W→E, from the west corner) → east (N→S) → west (S→N) → stacks | Owner: the library is 50–300 books and the preview shouldn't look like a big library; a room lined with ~19 empty bookcases looked wrong. North first so the books face you on entry |
| 2026-10-04 | Room halved to 7 × 5.5 × 3.2 m (was 10 × 8 × 3.6); furniture refitted (two shorter tables, armchair corner, two plants); freestanding stacks are sized to stop short of the table zone | Owner: "twice as smaller space at least" |
| 2026-10-04 | Controls are game-style: moving the mouse looks around (pointer lock; where the browser refuses it, a free-look fallback turns the view on plain mouse movement), W A S D walk/strafe, **Q / E turn**, ↑/↓ walk, ←/→ turn, PageUp/PageDown look up/down. Opening a book is click, **F** or Enter (not E as in §3.3) | Owner: keyboard-only movement and game-like mouse-look ("aswd and q e"); E is taken by turning |
| 2026-10-04 | Frame callbacks run inside try/catch in `Engine.tick` | An exception in a three.js animation-loop callback stops the loop for good (§3.7: a bad book never crashes the scene) |
| 2026-10-04 | `optimizeDeps.include` pre-bundles three, markdown-it, dompurify, pdfjs-dist and epubjs | Opening the first lazily-loaded reader in dev made Vite re-optimize deps and full-reload the page |
| 2026-10-04 | Package manager is **pnpm** (`pnpm-lock.yaml` imported from the npm lockfile with `pnpm import`, `packageManager: pnpm@10.33.0`; core-js/es5-ext build scripts deliberately ignored) | Owner: "install using pnpm" |
| 2026-10-04 | Layout v2: one bookcase along the whole north wall (no side-wall runs, no freestanding stacks); 3 open boards at 1.00 / 1.38 / 1.76 m over closed cabinets; boards fill top → bottom per section, sections left → right; the room only grows in length (1 m per section) if the books outgrow the wall; empty boards get a small decor composition, a ≥ 30 cm gap after a shelf's last book gets one item | Owner: books between 1 m and not too high, "the entire wall is a bookshelf", cozy items on parts of the shelf, paintings on the side walls. Supersedes the §3.2 perimeter/stacks rules and the earlier "only build what's needed" decision |
| 2026-10-04 | Stress/budget target is `?stress=500` | Owner: at most 300–500 books |
| 2026-10-04 | Frosted window glass = a 96 px cube capture of the garden (refreshed every 2 s) sampled along the view ray; the garden is only drawn into that cube (layer 1), never in the main view. Glass sits behind the mullions/blinds. Outside fog 6–80 m with a matching sky horizon | Owner asked for blurred, misty windows, then "less strong, less heavy": transmission cost ~2.9 ms/frame; this costs one quad and 10 draw calls total |
| 2026-10-04 | Venetian blinds (tilted slats, per-pane drop) cast striped shadows; sun lowered to ~24° from the south-west so light reaches the floor, the bookcase and the east wall | Owner: blinds on the windows and light falling on the walls |
| 2026-10-04 | GitHub Pages deploys from `.github/workflows/pages.yml` (pnpm, typecheck + test + build, upload `dist/`, deploy-pages) on push to `main` | Owner: "available via github pages via hook"; a push-triggered workflow is the hook. Never pushed from here |
| 2026-10-04 | Bookcase style: flush "system furniture" (IKEA-like): 4 cm white panels in one front plane, single top slab, handle-less cabinet doors with shadow gaps, dark recessed plinth, warm unlit LED strips under each board (one extra draw call). Blinds: chunky 8 cm slats over each whole pane, tilted open | Owner: "more stylish/futuristic - like ikea bookshelves and the blinds are more massive across the entire window pane" |
| 2026-10-04 | Room v3 (owner references: walnut/steel cubby shelving, built-ins around a window seat, shelving on brick): the north wall is low-poly brick (one merged mesh, ~1300 bricks); the bookcase is walnut boards with staggered dividers making boxes of different widths, a thin black steel frame, open backs, cabinets alternating doors / open cubbies (cubbies hold baskets and stacks; books still only 1.0–2.1 m). Books fill compartments in reading order, each shelf starting in a fresh compartment. South wall: a central bay window (trapezoid, cushioned seat, pillows, roman blind, three frosted panes) between two glazed spans with venetian blinds. Furniture: one central reading table (was two), armchair corner, plants | Owner: "the shelves are not just like plain closets but more like boxish", "one wall should be brickish and there should be a bay window". Supersedes the IKEA-style restyle |
| 2026-10-04 | Comic-book ink outlines: `EdgesGeometry` → `LineSegments2` (screen-space width 1.7 px; 1 px brown on the brick wall), one line mesh per merged mesh, books' edges as one segment set rebuilt on layout/hidden changes, outlines on the opened book; faces use polygon offset so the ink wins the depth test. No post-processing pass | Owner: "make edges of object have black comic book lines" |
| 2026-10-04 | Film grain is a CSS layer over the 3D canvas (procedural SVG `feTurbulence` tile, overlay blend, opacity 0.1, jittered 5×/s, static under reduced motion), not a WebGL pass | Owner asked for "a little bit post processing noise"; §3.2 says no post-processing, and the owner cares about cost — this costs a composited layer only |
| 2026-10-04 | Books opened from the List view skip the 3D pull-out animation; the list and reader sit above the Enter overlay (z-index 35/40) | Bug found in the subpath build: "Browse as a list" opened behind the overlay, and a list-opened book's 3D animation could block the next open while the tab wasn't rendering |

### Blockers
*(none)*

### Evidence log
| Date | Item | Evidence |
|---|---|---|
| 2026-10-04 | M0.1 | `npm run build` OK (vite 8.3.2); `vite preview --host 127.0.0.1` in the built-in browser shows the rotating cube; `__bookshelf.info()` frame counter advances, 1 draw call / 12 triangles |
| 2026-10-04 | M0.2 | `npm test` 4/4 pass (tests/names.test.ts); browser-pane smoke check against `vite preview`: 31 frames in 0.5 s; screenshot `docs/verification/m0-smoke.png` saved via `__bookshelf.snapshot('m0-smoke')` |
| 2026-10-04 | M1.1 | `npm test`: tests/scan.test.ts (13 tests: ordering, metadata precedence, ignored files, spaces/Unicode/#/%/& names, empty shelf, bad sidecar, one-level folders, root files ignored, music) |
| 2026-10-04 | M1.2 (partial) | dev-temp server: `/library.json` lists 6 shelves / 17 books; every manifest URL answers `Range: bytes=0-15` with 206 + correct Content-Range/Content-Type and file magic bytes. Still to check: large-copy watcher event, no full reload, `dist/` contents |
| 2026-10-04 | M1.3 | `npm test`: tests/library.test.ts (validate passes good manifests, skips 12+ malformed entries without throwing; diff added/removed/changed/shelf/track changes); client loader `src/data/library.ts` |
| 2026-10-04 | M1.4 | `node scripts/seed/build-seed.mjs <cache>`: 6 shelves, 15 books (md, txt incl. War and Peace 3.36 MB, 2 generated multi-page PDFs, multi-chapter EPUBs), 9.2 MB; licences in `books/SOURCES.md`; every file fetched via its manifest URL in the browser (206 + magic bytes) |
| 2026-10-04 | M1.5 | `npm test`: makeStressLibrary N=0/1/30/300/1000 validate with zero warnings, exactly N books, deterministic; gated by `TEST_HOOKS` in `src/data/library.ts` |
| 2026-10-04 | M1.6 | `npm test`: tests/linkfile.test.ts (BOM, CRLF/LF, key case, missing URL=, javascript:/data:/file:/credentials/over-long rejected with warnings, IDN, rejected links absent from the manifest JSON, ~10% website books in stress) |
| 2026-10-04 | M1.7 | `04-empiricists/IEP - Internet Encyclopedia of Philosophy.url` → https://iep.utm.edu/ and `06-everything-else/SEP - Stanford Encyclopedia of Philosophy.url` → https://plato.stanford.edu/; both 200 with no X-Frame-Options/CSP (embed: iframe sidecars) |
| 2026-10-04 | M2.4 | `npm test`: tests/layout.test.ts (17 tests: N=0/1/30/300/1000 × authoring on/off deterministic, no overlaps, no dropped books, 1.2 m aisle clearance, plus slots, room growth + stacks with 400 shelves, add-a-book stability) |
| 2026-10-04 | M2.1 | `src/scene/engine.ts`: ResizeObserver + orientationchange resize; dynamic pixel ratio observed moving 1 → 1.5 in the pane; `WEBGL_lose_context` lose/restore in the browser: `contextLost` true while lost, rendering resumes and 512 spine labels are redrawn (`docs/verification/m2-after-context-restore.png`); loop paused while `document.hidden` (pane hidden: frame counter stopped) |
| 2026-10-04 | M2.2 | `src/scene/room.ts`: 10 × 8 × 3.6 m shell, tiled floor, south wall of floor-to-ceiling glazing with mullions + transom; screenshots below |
| 2026-10-04 | M2.3 | 3 fixed poses: `docs/verification/m2-pose1-windows.png` (sun patches with mullion shadows, garden), `m2-pose2-shelves.png`, `m2-pose3-room.png`; NeutralToneMapping, whites not clipped (floor in sun reads cream, not pure white) |
| 2026-10-04 | M2.5 | `?stress=1000` in the browser via `renderer.info` at 5 poses: 15–16 draw calls, 45–47k triangles, 5 textures (spine atlas 2048² ≈ 21 MB with mips, plate atlas 1024² ≈ 5.6 MB, shadow map 2048² depth 16 MB → ≈ 43 MB); 512 spine labels near the player, 33 plates; `docs/verification/m2-stress1000.png` |
| 2026-10-04 | M2.6 | `src/scene/furniture.ts`: two reading tables + 12 stools, two armchairs + side table, three plants, each with an AABB collider; `docs/verification/m2-furniture-1.png`, `m2-furniture-2.png` |
| 2026-10-04 | M2.8 | Website books: 1 cm thick, pale-blue binding, dark head band with a white globe, title + domain lines; `?stress=1000` (105 website books) still 16 draw calls; `docs/verification/m2-website-books.png` |
| 2026-10-04 | M3.1 | Enter overlay (title, controls, progress bar, "17 books on 6 shelves", load-error + Retry path, "Browse as a list") seen in the pane; Help modal in `src/ui/help.ts` |
| 2026-10-04 | M3.4 | Pane: `faceBook(id)` + `pickCenter()` → id `01-ancient/Plato - Apology.md`, label "Apology — Plato" at 1.14 m; website: "Stanford Encyclopedia of Philosophy — plato.stanford.edu ↗"; ray reach 3 m, stack-divider occlusion (`rayBoxDistance`) |
| 2026-10-04 | M4.2 | Reader dialog (role=dialog, focus trap, Esc closes, title/author bar, progress, TOC, A−/A+, positions in localStorage via `store`), loading/error/empty states, fetch aborted on close; opened md/txt/pdf/epub/url in the dev pane |
| 2026-10-04 | M4.3 (partial) | War and Peace txt (3.36 MB): 12,168 paragraphs rendered in ~0.6 s with **zero** long tasks (PerformanceObserver longtask), 779 TOC entries; md Apology: sanitized, 3 TOC entries. Still to do: sanitizer unit test, 5 MB file |
| 2026-10-04 | M4.4 (dev) | Descartes PDF: 62 pages, worker `pdf.worker.min.mjs` loaded as its own file, page jump to 3 and 12 works ("p. 12 / 62"), virtualized canvases (3 live). `vite preview` check pending |
| 2026-10-04 | M4.5 (dev) | Augustine EPUB from ArrayBuffer: 15 TOC entries, clicking "BOOK III" displays Book III; content iframe sandbox = `allow-same-origin` (no scripts). `vite preview` check pending |
| 2026-10-04 | M2.9 | `pnpm test` (60 pass: books 1.0–2.1 m, decor never overlaps books, full-wall sections, growth only past the wall); screenshots `docs/verification/m2b-bookwall.png`, `m2b-shelves-close.png`, `m2b-light-blinds.png`, `m2b-west-wall.png`; 16 draw calls, ~16k triangles |
| 2026-10-04 | M2.9 (restyle) | `docs/verification/m2c-bookwall.png`, `m2c-shelves-close.png`, `m2c-blinds.png`; 17 draw calls; `pnpm test` 60 pass. Snapshots now render at a fixed 1280×800 so they work while the pane is hidden |
| 2026-10-04 | M4.4 (preview) | `pnpm run build` + `scripts/serve-subpath.mjs`: Descartes PDF opened from the List view under `/bookshelf/`: 62 pages, worker `/bookshelf/assets/pdf.worker.min-*.mjs`, book `/bookshelf/books/03-rationalists/…pdf`, state ready, "p. 1 / 62" |
| 2026-10-04 | M4.5 (preview) | Same build: Augustine EPUB from `/bookshelf/books/02-medieval/…epub`, 15 TOC entries, content iframe sandbox `allow-same-origin` only. TOC navigation verified in dev (BOOK III) |
| 2026-10-04 | M8.2 | `node scripts/serve-subpath.mjs` (dist/ at `/bookshelf/`, like a GitHub Pages project site): `library.json` fetched from `/bookshelf/library.json`, "17 books on 6 shelves", PDF and EPUB open, no `__bookshelf` hook and no author-token meta in the build |
| 2026-10-04 | M8.3 (written) | `.github/workflows/pages.yml`: push to `main` / manual → pnpm install --frozen-lockfile, typecheck, test, build → upload-pages-artifact v5 → deploy-pages v5. Activates once pushed and Settings → Pages → Source = GitHub Actions |
| 2026-10-04 | M2.9 (v3) | `docs/verification/m2d-bookwall.png`, `m2d-shelves-close.png`, `m2d-bay.png`, `m2d-room.png`; 29 draw calls, ~189k triangles (ink lines included); `pnpm test` 60 pass |

### Ideas parking lot
- Deep link to a book (`#/shelf/…/book/…`) so the owner can share "my copy of X".
- Per-shelf accent colour.
- Footstep and page-turn sounds (off by default).
- Snapshot mode for website books (archive a page via SingleFile or Readability → md) to survive link rot; favicon or screenshot on the cover.

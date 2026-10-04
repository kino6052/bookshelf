import { h } from './dom'
import { Modal } from './modal'

export function helpModal(authoring: boolean): Modal {
  const m = new Modal('How to use the library')
  m.body.append(
    h('h3', {}, 'Walking'),
    h('ul', {}, h('li', {}, 'Move the mouse to look around (no button needed). On a phone: left thumb walks, right thumb looks.'), h('li', {}, h('kbd', {}, 'W A S D'), ' walk and step sideways, ', h('kbd', {}, 'Q E'), ' turn, ', h('kbd', {}, 'Shift'), ' to walk faster.'), h('li', {}, 'Keyboard only also works: ', h('kbd', {}, '↑ ↓ ← →'), ' walk and turn, ', h('kbd', {}, 'PgUp PgDn'), ' look up and down, ', h('kbd', {}, 'F'), ' or ', h('kbd', {}, 'Enter'), ' open.'), h('li', {}, h('kbd', {}, 'Esc'), ' frees the cursor and shows the menu; click the room to look around again.')),
    h('h3', {}, 'Books'),
    h('ul', {}, h('li', {}, 'Look at a book (or point at it) and click, tap or press ', h('kbd', {}, 'F'), ' to take it off the shelf and read it.'), h('li', {}, 'Slim pale-blue books with a globe are websites: they open the site, or a card with a link.'), h('li', {}, h('strong', {}, 'List'), ' shows every book with a filter; ', h('strong', {}, 'Locate'), ' walks you to it.')),
    h('h3', {}, 'Music'),
    h('p', {}, 'Ambient music plays while you wander. ', h('kbd', {}, 'M'), ' mutes it; the volume is in the menu.'),
    authoring ? h('div', {}, h('h3', {}, 'Adding books (dev server only)'), h('p', {}, 'Use “+ Add book”, click a glowing “+” slot at the end of a shelf, drop files or links onto a shelf, or copy files into a folder under books/.')) : '',
  )
  return m
}

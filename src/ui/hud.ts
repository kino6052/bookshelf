// HUD: crosshair (desktop, locked), hover label, the slim top bar for the unlocked state, music controls.
import { h } from './dom'

export interface HudHandlers {
  onResume: () => void
  onList: () => void
  onHelp: () => void
  onMute: () => void
  onVolume: (v: number) => void
  onAddBook?: () => void
}

export class Hud {
  readonly el: HTMLElement
  readonly bar: HTMLElement
  private readonly crosshair: HTMLElement
  private readonly label: HTMLElement
  private readonly muteBtn: HTMLButtonElement
  private readonly volume: HTMLInputElement
  private readonly nowPlaying: HTMLElement
  private readonly addBtn: HTMLButtonElement
  private readonly resumeBtn: HTMLButtonElement
  private readonly hint: HTMLElement

  constructor(handlers: HudHandlers) {
    this.crosshair = h('div', { class: 'crosshair', 'aria-hidden': 'true' })
    this.label = h('div', { class: 'hover-label', role: 'status', 'aria-live': 'polite', hidden: true })
    this.muteBtn = h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Mute music', title: 'Mute music (M)', onclick: () => handlers.onMute() }, '♪')
    this.volume = h('input', { class: 'volume', type: 'range', min: 0, max: 100, step: 1, value: 50, 'aria-label': 'Music volume' })
    this.volume.addEventListener('input', () => handlers.onVolume(Number(this.volume.value) / 100))
    this.nowPlaying = h('span', { class: 'now-playing', 'aria-live': 'off' })
    this.resumeBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => handlers.onResume() }, 'Resume')
    this.addBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => handlers.onAddBook?.() }, '+ Add book')
    this.bar = h(
      'nav',
      { class: 'topbar', 'aria-label': 'Library menu', hidden: true },
      this.resumeBtn,
      h('div', { class: 'music' }, this.muteBtn, this.volume, this.nowPlaying),
      h('button', { class: 'btn', type: 'button', onclick: () => handlers.onList() }, 'List'),
      h('button', { class: 'btn', type: 'button', onclick: () => handlers.onHelp() }, 'Help'),
      this.addBtn,
    )
    this.hint = h('div', { class: 'hud-hint', hidden: true }, 'Esc: menu')
    this.el = h('div', { class: 'hud' }, this.crosshair, this.label, this.bar, this.hint)
  }

  setMode(mode: 'locked' | 'unlocked' | 'touch' | 'hidden'): void {
    this.crosshair.hidden = mode !== 'locked'
    this.hint.hidden = mode !== 'locked'
    this.bar.hidden = mode === 'locked' || mode === 'hidden'
    this.resumeBtn.hidden = mode === 'touch'
    this.el.dataset.mode = mode
  }

  setHover(text: string | undefined, at?: { x: number; y: number }): void {
    if (!text) {
      this.label.hidden = true
      return
    }
    this.label.hidden = false
    if (this.label.textContent !== text) this.label.textContent = text
    if (at) {
      this.label.style.left = `${at.x}px`
      this.label.style.top = `${at.y + 22}px`
      this.label.classList.add('at-cursor')
    } else {
      this.label.style.left = ''
      this.label.style.top = ''
      this.label.classList.remove('at-cursor')
    }
  }

  setMusic(state: { muted: boolean; volume: number; title?: string }): void {
    this.muteBtn.textContent = '♪'
    this.muteBtn.setAttribute('aria-pressed', String(state.muted))
    this.muteBtn.setAttribute('aria-label', state.muted ? 'Unmute music' : 'Mute music')
    this.muteBtn.classList.toggle('muted', state.muted)
    this.volume.value = String(Math.round(state.volume * 100))
    this.nowPlaying.textContent = state.title ? `♫ ${state.title}` : ''
  }

  setAuthoring(on: boolean): void {
    this.addBtn.hidden = !on
  }
}

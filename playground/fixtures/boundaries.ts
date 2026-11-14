// playground/fixtures/boundaries.ts
import { mount } from 'smegglect'

class OpenCard extends HTMLElement {
  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    root.innerHTML = '<style>div{padding:12px;border:1px solid #6b8bd6;border-radius:8px}</style><div><button id="shadow-btn" type="button">Shadow button</button></div>'
  }
}
class ClosedCard extends HTMLElement {
  constructor() {
    super()
    const root = this.attachShadow({ mode: 'closed' })
    root.innerHTML = '<style>div{padding:12px;border:1px solid #d6886b;border-radius:8px}</style><div><button type="button">Closed button</button></div>'
  }
}
customElements.define('open-card', OpenCard)
customElements.define('closed-card', ClosedCard)

const ctx = (document.getElementById('canvas') as HTMLCanvasElement).getContext('2d')!
ctx.fillStyle = '#6b8bd6'
ctx.fillRect(20, 20, 80, 40)
ctx.fillStyle = '#d6886b'
ctx.fillRect(140, 50, 120, 50)

const toggle = document.getElementById('toggle')!
toggle.addEventListener('pointerdown', () => toggle.setAttribute('aria-pressed', String(toggle.getAttribute('aria-pressed') !== 'true')))

;(window as unknown as { sg: unknown }).sg = mount({ project: { id: 'boundaries' }, open: true })

// playground/fixtures/plain.ts
import * as smegglect from 'smegglect'
import * as dom from 'smegglect/dom'

declare global {
  interface Window {
    events: string[]
    sg: ReturnType<typeof smegglect.mount> | undefined
    smegglect: typeof smegglect
    smegglectDom: typeof dom
  }
}

const { mount } = smegglect
window.smegglect = smegglect
window.smegglectDom = dom

window.events = []
const log = (e: Event) => window.events.push(`${e.type}:${(e.target as Element).id || (e.target as Element).localName}`)
for (const type of ['pointerdown', 'mousedown', 'click', 'submit', 'change', 'input']) document.addEventListener(type, log)
document.getElementById('order-form')!.addEventListener('submit', e => e.preventDefault())

const params = new URLSearchParams(location.search)
if (!params.has('manual')) {
  window.sg = mount({
    project: { id: 'playground' },
    open: params.has('open'),
    ...(params.has('memory') ? { storage: 'memory' as const } : {}),
    ...(params.get('locale') ? { locale: params.get('locale')! } : {}),
  })
}

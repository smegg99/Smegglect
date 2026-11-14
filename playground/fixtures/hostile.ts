// playground/fixtures/hostile.ts
import { mount } from 'smegglect'

declare global {
  interface Window {
    sg: ReturnType<typeof mount> | undefined
    snapshot: () => string
    mountNow: () => void
  }
}

// Computed styles of every host element, compared before and after mounting.
window.snapshot = () => {
  const out: string[] = []
  for (const el of document.querySelectorAll('body, body *')) {
    if (el.localName === 'script') continue
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    out.push(`${el.localName}#${el.id} ${r.x},${r.y},${r.width},${r.height} ${cs.font} ${cs.color} ${cs.background} ${cs.display} ${cs.position}`)
  }
  return out.join('\n')
}
window.mountNow = () => {
  window.sg = mount({ project: { id: 'hostile' }, open: true })
}

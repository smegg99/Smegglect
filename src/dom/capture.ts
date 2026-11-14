// src/dom/capture.ts
// Reads rendered geometry and allowlisted computed properties for evidence.

import type { CaptureConditions, Rect, TargetEvidence } from '../core/model'
import type { EvidenceNeed } from '../core/presets'
import { cleanLocation, cleanText } from '../core/redact'
import { describe, parentOf } from './describe'

const PROPERTIES: Record<EvidenceNeed, readonly string[]> = {
  box: ['display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height'],
  spacing: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap'],
  type: ['font-size', 'line-height', 'font-weight', 'letter-spacing', 'white-space', 'text-overflow'],
  overflow: ['overflow-x', 'overflow-y', 'text-overflow', 'white-space'],
  style: ['color', 'background-color', 'border-top-width', 'border-top-color', 'border-radius', 'opacity'],
  parent: [],
}

const PARENT_PROPERTIES = ['display', 'flex-direction', 'align-items', 'justify-content', 'gap', 'grid-template-columns']

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/** Any transform on the element or an ancestor means bounds are rendered, not layout boxes. */
export function transformed(el: Element): boolean {
  const win = el.ownerDocument.defaultView
  if (!win) return false
  for (let cur: Element | null = el, depth = 0; cur && depth < 64; cur = parentOf(cur), depth++) {
    const cs = win.getComputedStyle(cur)
    if (cs.transform !== 'none' || (cs.translate && cs.translate !== 'none') || (cs.scale && cs.scale !== 'none') || (cs.rotate && cs.rotate !== 'none')) {
      return true
    }
  }
  return false
}

function read(el: Element, names: Iterable<string>): Record<string, string> {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const name of names) {
    const v = cs.getPropertyValue(name)
    if (v) out[name] = cleanText(v, 120)
  }
  return out
}

/** Computed property names a preset may compare; anything else is ignored. */
const COMPARABLE = /^(min-|max-)?(width|height)$|^text-overflow$|^(padding|margin|border)(-(top|right|bottom|left))?(-(width|color|style))?$|^border-(top|bottom)-(left|right)-radius$|^(row-|column-)?gap$|^(font-(family|size|weight|style)|line-height|letter-spacing|color|background-color|opacity|text-align)$/

export function properties(el: Element, needs: readonly EvidenceNeed[], extra: readonly string[] = []): Record<string, string> {
  const names = new Set<string>()
  for (const need of needs) for (const n of PROPERTIES[need]) names.add(n)
  for (const n of extra) if (COMPARABLE.test(n)) names.add(n)
  const out = read(el, names)
  if (needs.includes('overflow') && el instanceof el.ownerDocument.defaultView!.HTMLElement) {
    out['scroll-width'] = String(el.scrollWidth)
    out['client-width'] = String(el.clientWidth)
    out['scroll-height'] = String(el.scrollHeight)
    out['client-height'] = String(el.clientHeight)
  }
  return out
}

export function evidenceOf(el: Element, needs: readonly EvidenceNeed[], attrs: readonly string[], extra: readonly string[] = []): Omit<TargetEvidence, 'source'> {
  const out: Omit<TargetEvidence, 'source'> = {
    bounds: rectOf(el),
    transformed: transformed(el),
    properties: properties(el, needs, extra),
  }
  const parent = parentOf(el)
  if (needs.includes('parent') && parent && parent.localName !== 'html') {
    out.parent = { element: describe(parent, attrs), bounds: rectOf(parent) }
    for (const [k, v] of Object.entries(read(parent, PARENT_PROPERTIES))) out.properties[`parent-${k}`] = v
  }
  return out
}

function luminance(color: string): number | null {
  const m = color.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+%?))?\)/)
  if (!m) return null
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  if (alpha < 0.5) return null
  const [r, g, b] = [m[1], m[2], m[3]].map(v => parseFloat(v as string) / 255) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The host page's rendered scheme: its background, then its color-scheme, then the OS preference. */
export function hostScheme(doc: Document): 'light' | 'dark' | 'unknown' {
  const win = doc.defaultView
  if (!win) return 'unknown'
  for (const el of [doc.body, doc.documentElement]) {
    if (!el) continue
    const l = luminance(win.getComputedStyle(el).backgroundColor)
    if (l !== null) return l < 0.45 ? 'dark' : 'light'
  }
  const declared = win.getComputedStyle(doc.documentElement).colorScheme
  if (declared === 'dark') return 'dark'
  const dark = win.matchMedia?.('(prefers-color-scheme: dark)')
  return dark ? (dark.matches ? 'dark' : 'light') : 'unknown'
}

export function conditions(doc: Document, screen?: string): CaptureConditions {
  const win = doc.defaultView!
  return {
    frame: 'viewport',
    units: 'css-px',
    viewport: { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight },
    scroll: { x: win.scrollX, y: win.scrollY },
    devicePixelRatio: win.devicePixelRatio,
    visualScale: win.visualViewport?.scale ?? 1,
    colorScheme: hostScheme(doc),
    location: cleanLocation(win.location.href),
    ...(screen ? { screen: cleanText(screen, 80) } : {}),
    capturedAt: new Date().toISOString(),
  }
}

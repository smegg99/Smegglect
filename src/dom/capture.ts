// src/dom/capture.ts
// Reads rendered geometry and allowlisted computed properties for evidence.

import type { CaptureConditions, Rect, TargetEvidence } from '../core/model'
import type { EvidenceNeed } from '../core/presets'
import { cleanLocation, cleanText } from '../core/redact'
import { describe, parentOf } from './describe'
import { windowOf } from './window'

const PROPERTIES: Record<EvidenceNeed, readonly string[]> = {
  box: [
    'display', 'position', 'box-sizing', 'width', 'height',
    'min-width', 'max-width', 'min-height', 'max-height',
  ],
  spacing: [
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap',
  ],
  type: ['font-size', 'line-height', 'font-weight', 'letter-spacing', 'white-space', 'text-overflow'],
  overflow: ['overflow-x', 'overflow-y', 'text-overflow', 'white-space'],
  style: ['color', 'background-color', 'border-top-width', 'border-top-color', 'border-radius', 'opacity'],
  parent: [],
}

const PARENT_PROPERTIES = [
  'display', 'flex-direction', 'align-items', 'justify-content', 'gap', 'grid-template-columns',
]

export function rectOf(element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

/** Whether the element has a box: under display: none (a view kept behind v-show) it reads as 0,0. */
export function rendered(element: Element): boolean {
  return element.isConnected && element.getClientRects().length > 0
}

/** Any transform on the element or an ancestor means bounds are rendered, not layout boxes. */
export function transformed(element: Element): boolean {
  const win = element.ownerDocument.defaultView
  if (!win) return false
  for (let cur: Element | null = element, depth = 0; cur && depth < 64; cur = parentOf(cur), depth++) {
    const cs = win.getComputedStyle(cur)
    if (
      cs.transform !== 'none'
      || (cs.translate && cs.translate !== 'none')
      || (cs.scale && cs.scale !== 'none')
      || (cs.rotate && cs.rotate !== 'none')
    ) {
      return true
    }
  }
  return false
}

function read(element: Element, names: Iterable<string>): Record<string, string> {
  const cs = windowOf(element.ownerDocument).getComputedStyle(element)
  const out: Record<string, string> = {}
  for (const name of names) {
    const value = cs.getPropertyValue(name)
    if (value) out[name] = cleanText(value, 120)
  }
  return out
}

/** Computed property names a preset may compare, one family per part; anything else is ignored. */
const COMPARABLE_PARTS = {
  size: String.raw`^(min-|max-)?(width|height)$`,
  textOverflow: String.raw`^text-overflow$`,
  edges: String.raw`^(padding|margin|border)(-(top|right|bottom|left))?(-(width|color|style))?$`,
  corners: String.raw`^border-(top|bottom)-(left|right)-radius$`,
  gaps: String.raw`^(row-|column-)?gap$`,
  look: String.raw`^(font-(family|size|weight|style)|line-height|letter-spacing|`
    + String.raw`color|background-color|opacity|text-align)$`,
}
const COMPARABLE = new RegExp(Object.values(COMPARABLE_PARTS).join('|'))

export function properties(
  element: Element,
  needs: readonly EvidenceNeed[],
  extra: readonly string[] = [],
): Record<string, string> {
  const names = new Set<string>()
  for (const need of needs) for (const name of PROPERTIES[need]) names.add(name)
  for (const name of extra) if (COMPARABLE.test(name)) names.add(name)
  const out = read(element, names)
  if (needs.includes('overflow') && element instanceof windowOf(element.ownerDocument).HTMLElement) {
    out['scroll-width'] = String(element.scrollWidth)
    out['client-width'] = String(element.clientWidth)
    out['scroll-height'] = String(element.scrollHeight)
    out['client-height'] = String(element.clientHeight)
  }
  return out
}

export function evidenceOf(
  element: Element,
  needs: readonly EvidenceNeed[],
  attrs: readonly string[],
  extra: readonly string[] = [],
): Omit<TargetEvidence, 'source'> {
  const out: Omit<TargetEvidence, 'source'> = {
    bounds: rectOf(element),
    transformed: transformed(element),
    properties: properties(element, needs, extra),
  }
  const parent = parentOf(element)
  if (needs.includes('parent') && parent && parent.localName !== 'html') {
    out.parent = { element: describe(parent, attrs), bounds: rectOf(parent) }
    for (const [name, value] of Object.entries(read(parent, PARENT_PROPERTIES))) {
      out.properties[`parent-${name}`] = value
    }
  }
  return out
}

/** The alpha part of an rgba() colour: 1 when there is none, else a fraction or a percentage. */
function alphaOf(part: string | undefined): number {
  if (part === undefined) return 1
  return part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part)
}

function luminance(color: string): number | null {
  const match = color.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+%?))?\)/)
  if (!match) return null
  const alpha = alphaOf(match[4])
  if (alpha < 0.5) return null
  const [red, green, blue] = [match[1], match[2], match[3]]
    .map(channel => parseFloat(channel as string) / 255) as [number, number, number]
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** The host page's rendered scheme: its background, then its color-scheme, then the OS preference. */
export function hostScheme(doc: Document): 'light' | 'dark' | 'unknown' {
  const win = doc.defaultView
  if (!win) return 'unknown'
  for (const element of [doc.body, doc.documentElement]) {
    if (!element) continue
    const level = luminance(win.getComputedStyle(element).backgroundColor)
    if (level !== null) return level < 0.45 ? 'dark' : 'light'
  }
  const declared = win.getComputedStyle(doc.documentElement).colorScheme
  if (declared === 'dark') return 'dark'
  const dark = win.matchMedia?.('(prefers-color-scheme: dark)')
  if (!dark) return 'unknown'
  return dark.matches ? 'dark' : 'light'
}

/** Characters of the host's screen name kept with a capture. */
const SCREEN_CHARS = 80

/** The screen name as a capture keeps it; pins and checks compare a page's name in this same form. */
export function screenName(screen: string | undefined): string {
  return screen ? cleanText(screen, SCREEN_CHARS) : ''
}

export function conditions(doc: Document, screen?: string): CaptureConditions {
  const win = windowOf(doc)
  return {
    frame: 'viewport',
    units: 'css-px',
    viewport: { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight },
    scroll: { x: win.scrollX, y: win.scrollY },
    devicePixelRatio: win.devicePixelRatio,
    visualScale: win.visualViewport?.scale ?? 1,
    colorScheme: hostScheme(doc),
    location: cleanLocation(win.location.href),
    ...(screen ? { screen: screenName(screen) } : {}),
    capturedAt: new Date().toISOString(),
  }
}

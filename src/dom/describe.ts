// src/dom/describe.ts
// Live element -> safe descriptor. Reads attributes and text; never values, never outerHTML.

import type { BoundaryKind, ElementDescriptor } from '../core/model'
import { cleanClasses, cleanText, stableId } from '../core/redact'
import { LIMITS } from '../core/validate'
import { HOST_TAG } from './host'

export const DEFAULT_TEST_ATTRIBUTES = ['data-testid', 'data-test', 'data-cy', 'data-smegglect']

const IMPLICIT_ROLE: Record<string, string> = {
  a: 'link', button: 'button', select: 'combobox', textarea: 'textbox', nav: 'navigation',
  main: 'main', header: 'banner', footer: 'contentinfo', dialog: 'dialog', ul: 'list', ol: 'list',
  li: 'listitem', table: 'table', tr: 'row', td: 'cell', th: 'columnheader', img: 'img', h1: 'heading',
  h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', form: 'form',
}

const INPUT_ROLE: Record<string, string> = {
  checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', reset: 'button',
}

const SVG_SHAPES = new Set(['path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'use', 'text', 'tspan'])

export function roleOf(el: Element): string | undefined {
  const explicit = el.getAttribute('role')
  if (explicit) return cleanText(explicit.split(/\s+/)[0] ?? '', 32) || undefined
  const tag = el.localName
  if (tag === 'input') return INPUT_ROLE[(el as HTMLInputElement).type] ?? 'textbox'
  return IMPLICIT_ROLE[tag]
}

function labelledBy(el: Element): string {
  const ids = el.getAttribute('aria-labelledby')
  if (!ids) return ''
  const root = el.getRootNode() as Document | ShadowRoot
  return ids.split(/\s+/).map(id => root.getElementById?.(id)?.textContent ?? '').join(' ')
}

function fieldLabel(el: Element): string {
  const field = el as HTMLInputElement
  const labels = field.labels ? [...field.labels].map(l => l.textContent ?? '').join(' ') : ''
  return labels || el.getAttribute('placeholder') || el.getAttribute('name') || ''
}

/** Human-readable label. Input, textarea and select contents are never read. */
export function labelOf(el: Element): string {
  const tag = el.localName
  const raw = el.getAttribute('aria-label')
    || labelledBy(el)
    || (tag === 'input' || tag === 'textarea' || tag === 'select' ? fieldLabel(el) : '')
    || (tag === 'img' ? el.getAttribute('alt') ?? '' : '')
    || (tag === 'input' || tag === 'textarea' || tag === 'select' ? '' : (el.textContent ?? '').slice(0, 400))
    || el.getAttribute('title')
    || ''
  return cleanText(raw, LIMITS.label)
}

function signature(el: Element): string {
  return `${el.localName}.${[...el.classList].sort().join('.')}`
}

function testIdOf(el: Element, attrs: readonly string[]): string | undefined {
  for (const a of attrs) {
    const v = el.getAttribute(a)
    if (v) return cleanText(v, 64)
  }
  return undefined
}

/** Parent across an open shadow boundary. */
export function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement
  const root = el.getRootNode()
  return root instanceof (el.ownerDocument.defaultView?.ShadowRoot ?? ShadowRoot) ? root.host : null
}

function step(el: Element, attrs: readonly string[]): string {
  const id = stableId(el.id)
  if (id) return `${el.localName}#${id}`
  const test = testIdOf(el, attrs)
  if (test) return `${el.localName}[test=${test}]`
  return el.localName
}

/** First ancestor level where this branch repeats among siblings: index, count and the item's own text. */
export function occurrenceOf(el: Element, maxDepth = 6): { index: number, count: number, item?: string } | undefined {
  let node: Element | null = el
  for (let depth = 0; node && depth < maxDepth; depth++) {
    const parent: Element | null = node.parentElement
    if (!parent) return undefined
    const sig = signature(node)
    const peers = [...parent.children].filter(c => signature(c) === sig)
    if (peers.length >= 2) {
      const item = cleanText((node.textContent ?? '').slice(0, 400), 60)
      return item ? { index: peers.indexOf(node), count: peers.length, item } : { index: peers.indexOf(node), count: peers.length }
    }
    node = parent
  }
  return undefined
}

function shadowDepth(el: Element): number {
  let depth = 0
  let root = el.getRootNode()
  while (root && root !== el.ownerDocument) {
    depth++
    const host: Element | undefined = (root as ShadowRoot).host
    if (!host) break
    root = host.getRootNode()
  }
  return depth
}

export function describe(el: Element, attrs: readonly string[] = DEFAULT_TEST_ATTRIBUTES): ElementDescriptor {
  const path: string[] = []
  let cur = parentOf(el)
  while (cur && path.length < LIMITS.path && cur.localName !== 'html') {
    path.unshift(step(cur, attrs))
    if (cur.localName === 'body') break
    cur = parentOf(cur)
  }
  const out: ElementDescriptor = {
    tag: el.localName,
    classes: cleanClasses(el.classList),
    path,
    shadowDepth: shadowDepth(el),
  }
  const role = roleOf(el)
  if (role) out.role = role
  const label = labelOf(el)
  if (label) out.label = label
  const id = stableId(el.id)
  if (id) out.id = id
  const test = testIdOf(el, attrs)
  if (test) out.testId = test
  const occurrence = occurrenceOf(el)
  if (occurrence) out.occurrence = occurrence
  return out
}

/** Picking an SVG path selects its drawing; the parent action goes further up. */
export function pickable(el: Element): Element {
  if (SVG_SHAPES.has(el.localName) && el.namespaceURI === 'http://www.w3.org/2000/svg') {
    const svg = el.closest('svg')
    if (svg) return svg
  }
  return el
}

/** Content Smegglect cannot see inside. */
export function boundaryOf(el: Element): BoundaryKind | undefined {
  const tag = el.localName
  if (tag === 'canvas') return 'canvas'
  if (tag === 'iframe' || tag === 'frame' || tag === 'object' || tag === 'embed') return 'iframe'
  if (el.shadowRoot === null && (el as HTMLElement).attachShadow && tag.includes('-') && isClosedHost(el)) return 'closed-root'
  return undefined
}

function isClosedHost(el: Element): boolean {
  // A custom element with rendered size but no light-DOM children and no open root likely renders into a closed root.
  return el.childElementCount === 0 && !el.textContent?.trim() && el.getClientRects().length > 0
}

/** Short human chip text: `button "Save"`. */
export function chipOf(d: ElementDescriptor): string {
  const head = d.role && d.role !== d.tag ? `${d.tag} (${d.role})` : d.tag
  return d.label ? `${head} "${d.label.length > 28 ? `${d.label.slice(0, 27)}...` : d.label}"` : head
}

/** Deepest host element at a viewport point, through open shadow roots, skipping Smegglect's host. */
export function under(doc: Document, x: number, y: number): Element | null {
  // Document hit testing retargets anything in Smegglect's shadow tree to its host element.
  const probe = (root: Document | ShadowRoot): Element | null =>
    root.elementsFromPoint(x, y).find(el => el.localName !== HOST_TAG) ?? null
  let el = probe(doc)
  for (let depth = 0; el?.shadowRoot && depth < 16; depth++) {
    const inner = probe(el.shadowRoot)
    if (!inner || inner === el) break
    el = inner
  }
  return el
}

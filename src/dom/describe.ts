// src/dom/describe.ts
// Live element -> safe descriptor. Reads attributes and text; never values, never outerHTML.

import type { BoundaryKind, ElementDescriptor } from '../core/model'
import { cleanClasses, cleanText, stableId } from '../core/redact'
import { LIMITS } from '../core/limits'
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

/** Characters of text read for a label or a list item before cleaning, so a long container stops early. */
const TEXT_READ = 400

/** Ancestor levels searched for a branch that repeats among its siblings. */
const OCCURRENCE_DEPTH = 6

const SVG_SHAPES = new Set([
  'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'use', 'text', 'tspan',
])

export function roleOf(element: Element): string | undefined {
  const explicit = element.getAttribute('role')
  if (explicit) return cleanText(explicit.split(/\s+/)[0] ?? '', 32) || undefined
  const tag = element.localName
  if (tag === 'input') return INPUT_ROLE[(element as HTMLInputElement).type] ?? 'textbox'
  return IMPLICIT_ROLE[tag]
}

function labelledBy(element: Element): string {
  const ids = element.getAttribute('aria-labelledby')
  if (!ids) return ''
  const root = element.getRootNode() as Document | ShadowRoot
  return ids.split(/\s+/).map(id => root.getElementById?.(id)?.textContent ?? '').join(' ')
}

function fieldLabel(element: Element): string {
  const field = element as HTMLInputElement
  const labels = field.labels ? [...field.labels].map(label => label.textContent ?? '').join(' ') : ''
  return labels || element.getAttribute('placeholder') || element.getAttribute('name') || ''
}

/** Human-readable label. Input, textarea and select contents are never read. */
export function labelOf(element: Element): string {
  const tag = element.localName
  const formField = tag === 'input' || tag === 'textarea' || tag === 'select'
  const raw = element.getAttribute('aria-label')
    || labelledBy(element)
    || (formField ? fieldLabel(element) : '')
    || (tag === 'img' ? element.getAttribute('alt') ?? '' : '')
    || (formField ? '' : (element.textContent ?? '').slice(0, TEXT_READ))
    || element.getAttribute('title')
    || ''
  return cleanText(raw, LIMITS.label)
}

function signature(element: Element): string {
  return `${element.localName}.${[...element.classList].sort().join('.')}`
}

function testIdOf(element: Element, attrs: readonly string[]): string | undefined {
  for (const attribute of attrs) {
    const value = element.getAttribute(attribute)
    if (value) return cleanText(value, 64)
  }
  return undefined
}

/** Parent across an open shadow boundary. */
export function parentOf(element: Element): Element | null {
  if (element.parentElement) return element.parentElement
  const root = element.getRootNode()
  return root instanceof (element.ownerDocument.defaultView?.ShadowRoot ?? ShadowRoot) ? root.host : null
}

function step(element: Element, attrs: readonly string[]): string {
  const id = stableId(element.id)
  if (id) return `${element.localName}#${id}`
  const test = testIdOf(element, attrs)
  if (test) return `${element.localName}[test=${test}]`
  return element.localName
}

/** First ancestor level where this branch repeats among siblings: index, count and the item's own text. */
export function occurrenceOf(element: Element): { index: number, count: number, item?: string } | undefined {
  let node: Element | null = element
  for (let depth = 0; node && depth < OCCURRENCE_DEPTH; depth++) {
    const parent: Element | null = node.parentElement
    if (!parent) return undefined
    const sig = signature(node)
    const peers = [...parent.children].filter(child => signature(child) === sig)
    if (peers.length >= 2) {
      const item = cleanText((node.textContent ?? '').slice(0, TEXT_READ), 60)
      return item
        ? { index: peers.indexOf(node), count: peers.length, item }
        : { index: peers.indexOf(node), count: peers.length }
    }
    node = parent
  }
  return undefined
}

function shadowDepth(element: Element): number {
  let depth = 0
  let root = element.getRootNode()
  while (root && root !== element.ownerDocument) {
    depth++
    const host: Element | undefined = (root as ShadowRoot).host
    if (!host) break
    root = host.getRootNode()
  }
  return depth
}

/** The element's ancestors below `html`, nearest last, each as a `step`; at most LIMITS.path of them. */
export function pathOf(element: Element, attrs: readonly string[]): string[] {
  const path: string[] = []
  let cur = parentOf(element)
  while (cur && path.length < LIMITS.path && cur.localName !== 'html') {
    path.unshift(step(cur, attrs))
    if (cur.localName === 'body') break
    cur = parentOf(cur)
  }
  return path
}

export function describe(
  element: Element,
  attrs: readonly string[] = DEFAULT_TEST_ATTRIBUTES,
): ElementDescriptor {
  const out: ElementDescriptor = {
    tag: element.localName,
    classes: cleanClasses(element.classList),
    path: pathOf(element, attrs),
    shadowDepth: shadowDepth(element),
  }
  const role = roleOf(element)
  if (role) out.role = role
  const label = labelOf(element)
  if (label) out.label = label
  const id = stableId(element.id)
  if (id) out.id = id
  const test = testIdOf(element, attrs)
  if (test) out.testId = test
  const occurrence = occurrenceOf(element)
  if (occurrence) out.occurrence = occurrence
  return out
}

/** Picking an SVG path selects its drawing; the parent action goes further up. */
export function pickable(element: Element): Element {
  if (SVG_SHAPES.has(element.localName) && element.namespaceURI === 'http://www.w3.org/2000/svg') {
    const svg = element.closest('svg')
    if (svg) return svg
  }
  return element
}

/** Content Smegglect cannot see inside. */
export function boundaryOf(element: Element): BoundaryKind | undefined {
  const tag = element.localName
  if (tag === 'canvas') return 'canvas'
  if (tag === 'iframe' || tag === 'frame' || tag === 'object' || tag === 'embed') return 'iframe'
  if (
    element.shadowRoot === null
    && (element as HTMLElement).attachShadow
    && tag.includes('-')
    && isClosedHost(element)
  ) return 'closed-root'
  return undefined
}

function isClosedHost(element: Element): boolean {
  // A custom element with rendered size but no light-DOM children and no open root
  // likely renders into a closed root.
  return element.childElementCount === 0
    && !element.textContent?.trim()
    && element.getClientRects().length > 0
}

/** Short human chip text: `button "Save"`. */
export function chipOf(descriptor: ElementDescriptor): string {
  const { tag, role, label } = descriptor
  const head = role && role !== tag ? `${tag} (${role})` : tag
  if (!label) return head
  const shown = label.length > 28 ? `${label.slice(0, 27)}...` : label
  return `${head} "${shown}"`
}

/** Deepest host element at a viewport point, through open shadow roots, skipping Smegglect's host. */
export function under(doc: Document, x: number, y: number): Element | null {
  // Document hit testing retargets anything in Smegglect's shadow tree to its host element.
  const probe = (root: Document | ShadowRoot): Element | null =>
    root.elementsFromPoint(x, y).find(element => element.localName !== HOST_TAG) ?? null
  let element = probe(doc)
  for (let depth = 0; element?.shadowRoot && depth < 16; depth++) {
    const inner = probe(element.shadowRoot)
    if (!inner || inner === element) break
    element = inner
  }
  return element
}

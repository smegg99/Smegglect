// src/dom/contents.ts
// The elements a region holds, read from the page once, when the drag ends.

import { selectContents, type Placed } from '../core/contents'
import { intersection } from '../core/geometry'
import { LIMITS } from '../core/limits'
import type { ContentsMode, Rect } from '../core/model'
import { rectOf } from './capture'
import { HOST_TAG } from './host'

/** The page is where a region is drawn, never what it holds; head and Smegglect's own tree hold nothing. */
const PAGE: ReadonlySet<string> = new Set(['html', 'body'])
const SKIPPED: ReadonlySet<string> = new Set(['head', HOST_TAG])
/** Controls and media: listed whole or not at all, never as their inner parts. */
const ATOMIC: ReadonlySet<string> = new Set([
  'button', 'input', 'select', 'textarea', 'progress', 'meter',
  'img', 'picture', 'svg', 'video', 'audio', 'canvas', 'iframe', 'object', 'embed',
])

/**
 * What an element shows inside it, as the page is drawn: a host shows its open shadow tree (its light
 * children only through its slots), a slot the elements assigned to it (else its fallback).
 */
function shownIn(element: Element): Element[] {
  if (element.shadowRoot) return [...element.shadowRoot.children]
  const slot = element.localName === 'slot' ? element as HTMLSlotElement : null
  const assigned = slot?.assignedElements({ flatten: true }) ?? []
  return assigned.length ? assigned : [...element.children]
}

/** Every element with a box, in the order the page draws them, open shadow roots included. */
function placedIn(doc: Document): Placed<Element>[] {
  const placed: Placed<Element>[] = []
  const stack: [Element, Element | null][] = [[doc.documentElement, null]]
  while (stack.length) {
    const [element, parent] = stack.pop() as [Element, Element | null]
    if (SKIPPED.has(element.localName)) continue
    // display: none and display: contents measure 0 x 0.
    const rect = rectOf(element)
    const boxed = rect.width > 0 && rect.height > 0 && !PAGE.has(element.localName)
    if (boxed) placed.push({ item: element, rect, parent, atomic: ATOMIC.has(element.localName) })
    // Elements without a box still hold ones that have one: display: contents, a zero-height wrapper.
    const children = shownIn(element)
    const holder = boxed ? element : parent
    for (let i = children.length - 1; i >= 0; i--) stack.push([children[i] as Element, holder])
  }
  return placed
}

/** Where an area is probed for what is on top: its centre, then its quarter points. */
function probes(area: Rect): [number, number][] {
  const at = (fx: number, fy: number): [number, number] => {
    return [area.x + area.width * fx, area.y + area.height * fy]
  }
  return [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)]
}

/** Whether the person can see the element where the region meets it: not hidden, and on top there. */
function seen(element: Element, rect: Rect, region: Rect): boolean {
  const options = { opacityProperty: true, visibilityProperty: true }
  if (typeof element.checkVisibility === 'function' && !element.checkVisibility(options)) return false
  const win = element.ownerDocument.defaultView
  // Hit testing passes over pointer-events: none, as on a disabled button: its box is taken as seen.
  if (!win || win.getComputedStyle(element).pointerEvents === 'none') return true
  const tree = element.getRootNode() as Document | ShadowRoot
  // Smegglect's own panel over the page hides nothing the person reports on.
  const top = (x: number, y: number) => tree.elementsFromPoint(x, y).find(hit => hit.localName !== HOST_TAG)
  return probes(intersection(rect, region) ?? rect).some(([x, y]) => {
    const hit = top(x, y)
    return hit !== undefined && (hit === element || element.contains(hit))
  })
}

/** What a region in viewport coordinates holds: the first `LIMITS.members` elements and how many in all. */
export function regionContents(
  doc: Document,
  region: Rect,
  mode: ContentsMode,
): { elements: Element[], total: number } {
  const visible = (element: Element, rect: Rect) => seen(element, rect, region)
  const { items, total } = selectContents(placedIn(doc), region, mode, LIMITS.members, visible)
  return { elements: items, total }
}

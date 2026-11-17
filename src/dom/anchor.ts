// src/dom/anchor.ts
// The element a region is drawn on, so the region goes where that element goes: scrolled inside its box,
// moved as the page reflows, or found again after a reload.

import type { Rect } from '../core/model'
import type { Anchor } from '../core/modes'
import { rectOf } from './capture'
import { HOST_TAG } from './host'

/** Whether `outer` holds all of `inner`, to the half pixel a rounded box can be off by. */
function holds(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x - 0.5
    && inner.y >= outer.y - 0.5
    && inner.x + inner.width <= outer.x + outer.width + 0.5
    && inner.y + inner.height <= outer.y + outer.height + 0.5
}

/** The topmost element under a viewport rectangle's middle whose box holds all of it; never the overlay. */
function holder(doc: Document, rect: Rect): Element | null {
  const hits = doc.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
  return hits.find(element => element.localName !== HOST_TAG && holds(rectOf(element), rect)) ?? null
}

const area = (element: Element) => {
  const box = rectOf(element)
  return box.width * box.height
}

/**
 * The element a viewport rectangle is drawn on, and the rectangle's corner from that element's: the largest
 * of the elements wholly inside it, which it was drawn around; when none is, the one that holds it all.
 */
export function anchorOf(doc: Document, rect: Rect, inside: readonly Element[]): Anchor<Element> | null {
  const larger = (best: Element | null, element: Element) =>
    (!best || area(element) > area(best) ? element : best)
  const around = inside.reduce<Element | null>(larger, null)
  const element = around ?? holder(doc, rect)
  if (!element) return null
  const box = rectOf(element)
  return { handle: element, offset: { x: rect.x - box.x, y: rect.y - box.y } }
}

/** Where a region with this anchor is now, in viewport coordinates, keeping the size it was drawn at. */
export function anchoredRect(anchor: Anchor<Element>, size: { width: number, height: number }): Rect {
  const box = rectOf(anchor.handle)
  return { x: box.x + anchor.offset.x, y: box.y + anchor.offset.y, width: size.width, height: size.height }
}

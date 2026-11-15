// src/dom/spaces.ts
// The space under the pointer while measuring: a child's margin, the gap between two children, or an
// element's own padding. Picking one names the space instead of only the element around it.

import type { Rect } from '../core/model'
import { sidesOf, type Sides } from './boxmodel'
import { rectOf } from './capture'
import { windowOf } from './window'

export type Side = 'top' | 'right' | 'bottom' | 'left'

type SpaceKind = 'margin' | 'gap' | 'padding'

export interface SpaceHit {
  kind: SpaceKind
  /** For a margin or a padding: which side. */
  side?: Side
  /** The element whose margin or padding it is; for a gap, the two on either side of it. */
  elements: Element[]
  /** The space itself, in viewport coordinates. */
  rect: Rect
  /** Its size in CSS px across the space. */
  size: number
}

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

/** A space thinner than this is not worth pointing at. */
const MIN_SPACE = 2

const inside = (rect: Rect, x: number, y: number) => {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
}

/** The band of `outer` outside `inner` on one side. */
function band(outer: Rect, inner: Rect, side: Side): Rect {
  if (side === 'top') return { x: outer.x, y: outer.y, width: outer.width, height: inner.y - outer.y }
  if (side === 'bottom') {
    const top = inner.y + inner.height
    return { x: outer.x, y: top, width: outer.width, height: outer.y + outer.height - top }
  }
  if (side === 'left') return { x: outer.x, y: outer.y, width: inner.x - outer.x, height: outer.height }
  const left = inner.x + inner.width
  return { x: left, y: outer.y, width: outer.x + outer.width - left, height: outer.height }
}

function shrink(rect: Rect, by: Sides): Rect {
  return {
    x: rect.x + by.left,
    y: rect.y + by.top,
    width: rect.width - by.left - by.right,
    height: rect.height - by.top - by.bottom,
  }
}

function grow(rect: Rect, by: Sides): Rect {
  return shrink(rect, { top: -by.top, right: -by.right, bottom: -by.bottom, left: -by.left })
}

/** The side band between `outer` and `inner` that holds the point and is at least MIN_SPACE across. */
function sideAt(outer: Rect, inner: Rect, sizes: Sides, x: number, y: number): Side | null {
  for (const side of SIDES) {
    if (sizes[side] >= MIN_SPACE && inside(band(outer, inner, side), x, y)) return side
  }
  return null
}

function visibleChildren(element: Element): Element[] {
  return [...element.children].filter((child) => {
    const rect = child.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

function marginAt(element: Element, x: number, y: number): SpaceHit | null {
  const win = windowOf(element.ownerDocument)
  for (const child of visibleChildren(element)) {
    const box = rectOf(child)
    const margins = sidesOf(win.getComputedStyle(child), 'margin')
    const outer = grow(box, margins)
    const side = sideAt(outer, box, margins, x, y)
    if (!side) continue
    return { kind: 'margin', side, elements: [child], rect: band(outer, box, side), size: margins[side] }
  }
  return null
}

/** The space between two neighbours side by side (across x) or one above the other (across y). */
function between(first: Rect, second: Rect): { rect: Rect, size: number } | null {
  const top = Math.min(first.y, second.y)
  const bottom = Math.max(first.y + first.height, second.y + second.height)
  const left = Math.min(first.x, second.x)
  const right = Math.max(first.x + first.width, second.x + second.width)
  const firstRight = first.x + first.width
  const firstBottom = first.y + first.height
  const across = second.x - firstRight
  if (across >= MIN_SPACE) {
    return { rect: { x: firstRight, y: top, width: across, height: bottom - top }, size: across }
  }
  const down = second.y - firstBottom
  if (down >= MIN_SPACE) {
    return { rect: { x: left, y: firstBottom, width: right - left, height: down }, size: down }
  }
  return null
}

function gapAt(element: Element, x: number, y: number): SpaceHit | null {
  const children = visibleChildren(element)
  for (let i = 0; i + 1 < children.length; i++) {
    const first = children[i]
    const second = children[i + 1]
    if (!first || !second) continue
    const space = between(rectOf(first), rectOf(second))
    if (space && inside(space.rect, x, y)) return { kind: 'gap', elements: [first, second], ...space }
  }
  return null
}

function paddingAt(element: Element, x: number, y: number): SpaceHit | null {
  const style = windowOf(element.ownerDocument).getComputedStyle(element)
  const box = rectOf(element)
  const content = shrink(box, sidesOf(style, 'border', '-width'))
  const paddings = sidesOf(style, 'padding')
  const inner = shrink(content, paddings)
  const side = sideAt(content, inner, paddings, x, y)
  if (!side) return null
  const rect = band(content, inner, side)
  return { kind: 'padding', side, elements: [element], rect, size: paddings[side] }
}

/** A size to a hundredth of a px: sub-pixel layout differs by engine in the last digits. */
const hundredths = (size: number) => Math.round(size * 100) / 100

/** The most specific space at the point: a child's margin, then a gap between children, then own padding. */
export function spaceAt(element: Element, x: number, y: number): SpaceHit | null {
  const hit = marginAt(element, x, y) ?? gapAt(element, x, y) ?? paddingAt(element, x, y)
  return hit ? { ...hit, size: hundredths(hit.size) } : null
}

/** The space as an issue names it: `padding-top`, `margin-left` or `gap`. */
export function spaceName(hit: Pick<SpaceHit, 'kind' | 'side'>): string {
  return hit.side ? `${hit.kind}-${hit.side}` : hit.kind
}

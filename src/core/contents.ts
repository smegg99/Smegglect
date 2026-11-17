// src/core/contents.ts
// Which elements a drawn region selects, CAD-style: a window what lies inside, a crossing what it touches.

import { TOUCH_EPSILON, bottom, intersection, right } from './geometry'
import type { Rect } from './model'

/** Which elements a region selects: those fully inside it (dragged left to right) or those it touches. */
export type ContentsMode = 'inside' | 'touching'

/** One element of a walk, in document order; parent is its nearest placed ancestor. */
export interface Placed<T> {
  item: T
  rect: Rect
  parent: T | null
  /** A control, an image or other thing that is listed whole or not at all, never as its parts. */
  atomic?: boolean
}

function within(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x - TOUCH_EPSILON && inner.y >= outer.y - TOUCH_EPSILON
    && right(inner) <= right(outer) + TOUCH_EPSILON && bottom(inner) <= bottom(outer) + TOUCH_EPSILON
}

/**
 * The elements a region holds. Inside: the outermost ones fully within it. Touching: the ones it meets,
 * except those around all of it; a crossed container that holds two or more touched things gives way to
 * them, as a toolbar does to its buttons. `seen` says whether the person can see an element; one they
 * cannot gives way to what it holds. Returns the first `max` in document order.
 */
export function selectContents<T>(
  placed: readonly Placed<T>[],
  region: Rect,
  mode: ContentsMode,
  max: number,
  seen: (item: T, rect: Rect) => boolean = () => true,
): T[] {
  const children = new Map<T | null, Placed<T>[]>()
  for (const entry of placed) {
    const siblings = children.get(entry.parent)
    if (siblings) siblings.push(entry)
    else children.set(entry.parent, [entry])
  }
  const unitsOf = (entries: readonly Placed<T>[]): T[] => entries.flatMap(units)
  const shown = (entry: Placed<T>, otherwise: () => T[]) => {
    return seen(entry.item, entry.rect) ? [entry.item] : otherwise()
  }
  function units(entry: Placed<T>): T[] {
    const inner = () => entry.atomic ? [] : unitsOf(children.get(entry.item) ?? [])
    if (within(entry.rect, region)) return shown(entry, inner)
    const touched = intersection(entry.rect, region) !== null && !within(region, entry.rect)
    if (mode === 'inside' || !touched) return inner()
    if (entry.atomic) return shown(entry, () => [])
    const found = inner()
    return found.length >= 2 ? found : shown(entry, () => found)
  }
  return unitsOf(children.get(null) ?? []).slice(0, max)
}

// src/core/geometry.ts
// Pure rectangle math in CSS pixels. Values stay unrounded; only labels round.

import type { AxisRelation, Rect, Relation } from './model'

/** Edges closer than this are touching rather than a sub-pixel gap or overlap. */
export const TOUCH_EPSILON = 0.5

export const right = (rect: Rect) => rect.x + rect.width
export const bottom = (rect: Rect) => rect.y + rect.height
export const centerX = (rect: Rect) => rect.x + rect.width / 2
export const centerY = (rect: Rect) => rect.y + rect.height / 2

export function union(rects: readonly Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const rect of rects) {
    x1 = Math.min(x1, rect.x)
    y1 = Math.min(y1, rect.y)
    x2 = Math.max(x2, right(rect))
    y2 = Math.max(y2, bottom(rect))
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

export function intersection(a: Rect, b: Rect): Rect | null {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(right(a), right(b))
  const y2 = Math.min(bottom(a), bottom(b))
  if (x2 - x1 <= TOUCH_EPSILON || y2 - y1 <= TOUCH_EPSILON) return null
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/** Separation of two intervals: positive gap, touch, or overlap depth. */
export function axis(a1: number, a2: number, b1: number, b2: number): AxisRelation {
  const gap = Math.max(b1 - a2, a1 - b2)
  if (Math.abs(gap) <= TOUCH_EPSILON) return { kind: 'touch' }
  if (gap > 0) return { kind: 'gap', distance: gap }
  return { kind: 'overlap', distance: Math.min(a2, b2) - Math.max(a1, b1) }
}

export function relate(a: Rect, b: Rect): Relation {
  const horizontal = axis(a.x, right(a), b.x, right(b))
  const vertical = axis(a.y, bottom(a), b.y, bottom(b))
  return {
    horizontal,
    vertical,
    diagonal: horizontal.kind === 'gap' && vertical.kind === 'gap',
    overlap: intersection(a, b),
    delta: {
      left: b.x - a.x,
      right: right(b) - right(a),
      top: b.y - a.y,
      bottom: bottom(b) - bottom(a),
      centerX: centerX(b) - centerX(a),
      centerY: centerY(b) - centerY(a),
      width: b.width - a.width,
      height: b.height - a.height,
    },
  }
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
  value: number
}

/**
 * Guide for a horizontal gap: drawn at the vertical middle of the shared span.
 * Returns null when the boxes do not share a vertical span (a diagonal pair).
 */
export function horizontalGuide(a: Rect, b: Rect): Segment | null {
  const rel = axis(a.x, right(a), b.x, right(b))
  if (rel.kind !== 'gap') return null
  const top = Math.max(a.y, b.y)
  const low = Math.min(bottom(a), bottom(b))
  if (low < top) return null
  const y = (top + low) / 2
  const [x1, x2] = right(a) <= b.x ? [right(a), b.x] : [right(b), a.x]
  return { x1, y1: y, x2, y2: y, value: rel.distance }
}

export function verticalGuide(a: Rect, b: Rect): Segment | null {
  const rel = axis(a.y, bottom(a), b.y, bottom(b))
  if (rel.kind !== 'gap') return null
  const left = Math.max(a.x, b.x)
  const far = Math.min(right(a), right(b))
  if (far < left) return null
  const x = (left + far) / 2
  const [y1, y2] = bottom(a) <= b.y ? [bottom(a), b.y] : [bottom(b), a.y]
  return { x1: x, y1, x2: x, y2, value: rel.distance }
}

/** Successive gaps between members sorted along one axis. */
export function gaps(rects: readonly Rect[], along: 'horizontal' | 'vertical'): number[] {
  const sorted = [...rects].sort((first, second) => along === 'horizontal'
    ? first.x - second.x
    : first.y - second.y)
  const out: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as Rect
    const cur = sorted[i] as Rect
    out.push(along === 'horizontal' ? cur.x - right(prev) : cur.y - bottom(prev))
  }
  return out
}

export function shift(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height }
}

export function normalise(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
}

/** Display label: at most one decimal, no trailing zero. */
export function px(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

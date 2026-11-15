// src/overlay/guides.ts
// Which guides to draw for the current operation. Pure: rects in, lines and labels out.

import {
  axis, bottom, centerX, centerY, horizontalGuide, intersection, px, right, verticalGuide,
} from '../core/geometry'
import type { Rect } from '../core/model'
import type { BoxModel, Sides } from '../dom/boxmodel'

export interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
  kind: 'dist' | 'over' | 'edge' | 'tick'
}

export interface Label {
  x: number
  y: number
  text: string
  kind: 'size' | 'dist' | 'over' | 'pad' | 'mar'
}

export interface Drawing {
  lines: Line[]
  labels: Label[]
  boxes: { rect: Rect, kind: 'over' | 'padding' | 'margin' }[]
}

const empty = (): Drawing => ({ lines: [], labels: [], boxes: [] })

/** Distance between A and B, keeping gap, touch, overlap and diagonal separation distinct. */
export function pairwise(a: Rect, b: Rect): Drawing {
  const out = empty()
  const over = intersection(a, b)
  if (over) {
    out.boxes.push({ rect: over, kind: 'over' })
    out.labels.push({
      x: centerX(over),
      y: centerY(over),
      text: `${px(over.width)} x ${px(over.height)}`,
      kind: 'over',
    })
    return out
  }
  const horizontal = horizontalGuide(a, b)
  const vertical = verticalGuide(a, b)
  if (horizontal) {
    out.lines.push({ ...horizontal, kind: 'dist' })
    const middle = (horizontal.x1 + horizontal.x2) / 2
    out.labels.push({ x: middle, y: horizontal.y1, text: px(horizontal.value), kind: 'dist' })
  }
  if (vertical) {
    out.lines.push({ ...vertical, kind: 'dist' })
    const middle = (vertical.y1 + vertical.y2) / 2
    out.labels.push({ x: vertical.x1, y: middle, text: px(vertical.value), kind: 'dist' })
  }
  if (!horizontal && !vertical) {
    const ax = axis(a.x, right(a), b.x, right(b))
    const ay = axis(a.y, bottom(a), b.y, bottom(b))
    // Diagonal: two separations, labelled per axis, never one "gap".
    if (ax.kind === 'gap') {
      const y = centerY(a)
      const [x1, x2] = right(a) <= b.x ? [right(a), b.x] : [a.x, right(b)]
      out.lines.push({ x1, y1: y, x2, y2: y, kind: 'edge' })
      out.labels.push({ x: (x1 + x2) / 2, y, text: `dx ${px(ax.distance)}`, kind: 'dist' })
    }
    if (ay.kind === 'gap') {
      const x = centerX(b)
      const [y1, y2] = bottom(a) <= b.y ? [bottom(a), b.y] : [a.y, bottom(b)]
      out.lines.push({ x1: x, y1, x2: x, y2, kind: 'edge' })
      out.labels.push({ x, y: (y1 + y2) / 2, text: `dy ${px(ay.distance)}`, kind: 'dist' })
    }
    if (ax.kind === 'touch' || ay.kind === 'touch') {
      out.labels.push({
        x: (centerX(a) + centerX(b)) / 2,
        y: (centerY(a) + centerY(b)) / 2,
        text: '0',
        kind: 'dist',
      })
    }
  }
  return out
}

/** Height-only (or width-only) guides for match presets: each box's extent and nothing else. */
export function extents(a: Rect, b: Rect, dim: 'height' | 'width'): Drawing {
  const out = empty()
  for (const rect of [a, b]) {
    if (dim === 'height') {
      const x = rect.x - 6
      out.lines.push({ x1: x, y1: rect.y, x2: x, y2: bottom(rect), kind: 'dist' })
      out.lines.push(
        { x1: x - 3, y1: rect.y, x2: x + 3, y2: rect.y, kind: 'tick' },
        { x1: x - 3, y1: bottom(rect), x2: x + 3, y2: bottom(rect), kind: 'tick' },
      )
      out.labels.push({ x: x - 4, y: centerY(rect), text: px(rect.height), kind: 'dist' })
    }
    else {
      const y = bottom(rect) + 6
      out.lines.push({ x1: rect.x, y1: y, x2: right(rect), y2: y, kind: 'dist' })
      out.lines.push(
        { x1: rect.x, y1: y - 3, x2: rect.x, y2: y + 3, kind: 'tick' },
        { x1: right(rect), y1: y - 3, x2: right(rect), y2: y + 3, kind: 'tick' },
      )
      out.labels.push({ x: centerX(rect), y: y + 4, text: px(rect.width), kind: 'dist' })
    }
  }
  return out
}

const EDGE: Record<string, (rect: Rect) => number> = {
  'left': rect => rect.x,
  'right': right,
  'center-x': centerX,
  'top': rect => rect.y,
  'bottom': bottom,
  'center-y': centerY,
}

/** The reference edge extended across A, with A's offset from it. */
export function edgeGuide(a: Rect, b: Rect, edge: string): Drawing {
  const out = empty()
  const at = EDGE[edge]
  if (!at) return out
  const vertical = edge === 'left' || edge === 'right' || edge === 'center-x'
  const target = at(b)
  const delta = target - at(a)
  if (vertical) {
    out.lines.push({
      x1: target,
      y1: Math.min(a.y, b.y) - 8,
      x2: target,
      y2: Math.max(bottom(a), bottom(b)) + 8,
      kind: 'edge',
    })
    out.labels.push({ x: at(a), y: a.y - 10, text: `${delta > 0 ? '+' : ''}${px(delta)}`, kind: 'dist' })
  }
  else {
    out.lines.push({
      x1: Math.min(a.x, b.x) - 8,
      y1: target,
      x2: Math.max(right(a), right(b)) + 8,
      y2: target,
      kind: 'edge',
    })
    out.labels.push({ x: a.x - 18, y: at(a), text: `${delta > 0 ? '+' : ''}${px(delta)}`, kind: 'dist' })
  }
  return out
}

/**
 * Distances from each edge of `inner` to the same edge of `outer`:
 * labelled as distances, not padding or margin.
 */
export function inset(inner: Rect, outer: Rect): Drawing {
  const out = empty()
  const cy = centerY(inner)
  const cx = centerX(inner)
  const sides: [number, number, number, number][] = [
    [outer.x, cy, inner.x, cy],
    [right(inner), cy, right(outer), cy],
    [cx, outer.y, cx, inner.y],
    [cx, bottom(inner), cx, bottom(outer)],
  ]
  for (const [x1, y1, x2, y2] of sides) {
    const len = Math.abs(x2 - x1) + Math.abs(y2 - y1)
    if (len < 1) continue
    out.lines.push({ x1, y1, x2, y2, kind: 'dist' })
    out.labels.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, text: px(len), kind: 'dist' })
  }
  return out
}

const any = (sides: Sides) => sides.top !== 0 || sides.right !== 0 || sides.bottom !== 0 || sides.left !== 0

/** One label per non-zero side, centred in the band between `inner` and `outer`. */
function bandLabels(inner: Rect, outer: Rect, sides: Sides, kind: 'pad' | 'mar'): Label[] {
  const out: Label[] = []
  if (sides.top) out.push({ x: centerX(inner), y: (outer.y + inner.y) / 2, text: px(sides.top), kind })
  if (sides.right) {
    out.push({ x: (right(inner) + right(outer)) / 2, y: centerY(inner), text: px(sides.right), kind })
  }
  if (sides.bottom) out.push({
    x: centerX(inner),
    y: (bottom(inner) + bottom(outer)) / 2,
    text: px(sides.bottom),
    kind,
  })
  if (sides.left) out.push({ x: (outer.x + inner.x) / 2, y: centerY(inner), text: px(sides.left), kind })
  return out
}

/**
 * Padding as a dashed box inside the border and margin as one outside,
 * each side labelled when it is not zero.
 */
export function boxGuides(rect: Rect, box: BoxModel): Drawing {
  const out = empty()
  const { border, padding, margin } = box
  if (any(padding)) {
    const edge = {
      x: rect.x + border.left,
      y: rect.y + border.top,
      width: rect.width - border.left - border.right,
      height: rect.height - border.top - border.bottom,
    }
    const content = {
      x: edge.x + padding.left,
      y: edge.y + padding.top,
      width: edge.width - padding.left - padding.right,
      height: edge.height - padding.top - padding.bottom,
    }
    out.boxes.push({ rect: edge, kind: 'padding' })
    out.labels.push(...bandLabels(content, edge, padding, 'pad'))
  }
  if (any(margin)) {
    const outer = {
      x: rect.x - margin.left,
      y: rect.y - margin.top,
      width: rect.width + margin.left + margin.right,
      height: rect.height + margin.top + margin.bottom,
    }
    out.boxes.push({ rect: outer, kind: 'margin' })
    out.labels.push(...bandLabels(rect, outer, margin, 'mar'))
  }
  return out
}

export function merge(...parts: Drawing[]): Drawing {
  return {
    lines: parts.flatMap(part => part.lines),
    labels: parts.flatMap(part => part.labels),
    boxes: parts.flatMap(part => part.boxes),
  }
}

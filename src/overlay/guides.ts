// src/overlay/guides.ts
// Which guides to draw for the current operation. Pure: rects in, lines and labels out.

import { axis, bottom, centerX, centerY, horizontalGuide, intersection, px, right, verticalGuide } from '../core/geometry'
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
    out.labels.push({ x: centerX(over), y: centerY(over), text: `${px(over.width)} x ${px(over.height)}`, kind: 'over' })
    return out
  }
  const h = horizontalGuide(a, b)
  const v = verticalGuide(a, b)
  if (h) {
    out.lines.push({ ...h, kind: 'dist' })
    out.labels.push({ x: (h.x1 + h.x2) / 2, y: h.y1, text: px(h.value), kind: 'dist' })
  }
  if (v) {
    out.lines.push({ ...v, kind: 'dist' })
    out.labels.push({ x: v.x1, y: (v.y1 + v.y2) / 2, text: px(v.value), kind: 'dist' })
  }
  if (!h && !v) {
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
      out.labels.push({ x: (centerX(a) + centerX(b)) / 2, y: (centerY(a) + centerY(b)) / 2, text: '0', kind: 'dist' })
    }
  }
  return out
}

/** Height-only (or width-only) guides for match presets: each box's extent and nothing else. */
export function extents(a: Rect, b: Rect, dim: 'height' | 'width'): Drawing {
  const out = empty()
  for (const r of [a, b]) {
    if (dim === 'height') {
      const x = r.x - 6
      out.lines.push({ x1: x, y1: r.y, x2: x, y2: bottom(r), kind: 'dist' })
      out.lines.push({ x1: x - 3, y1: r.y, x2: x + 3, y2: r.y, kind: 'tick' }, { x1: x - 3, y1: bottom(r), x2: x + 3, y2: bottom(r), kind: 'tick' })
      out.labels.push({ x: x - 4, y: centerY(r), text: px(r.height), kind: 'dist' })
    }
    else {
      const y = bottom(r) + 6
      out.lines.push({ x1: r.x, y1: y, x2: right(r), y2: y, kind: 'dist' })
      out.lines.push({ x1: r.x, y1: y - 3, x2: r.x, y2: y + 3, kind: 'tick' }, { x1: right(r), y1: y - 3, x2: right(r), y2: y + 3, kind: 'tick' })
      out.labels.push({ x: centerX(r), y: y + 4, text: px(r.width), kind: 'dist' })
    }
  }
  return out
}

const EDGE: Record<string, (r: Rect) => number> = {
  'left': r => r.x,
  'right': right,
  'center-x': centerX,
  'top': r => r.y,
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
    out.lines.push({ x1: target, y1: Math.min(a.y, b.y) - 8, x2: target, y2: Math.max(bottom(a), bottom(b)) + 8, kind: 'edge' })
    out.labels.push({ x: at(a), y: a.y - 10, text: `${delta > 0 ? '+' : ''}${px(delta)}`, kind: 'dist' })
  }
  else {
    out.lines.push({ x1: Math.min(a.x, b.x) - 8, y1: target, x2: Math.max(right(a), right(b)) + 8, y2: target, kind: 'edge' })
    out.labels.push({ x: a.x - 18, y: at(a), text: `${delta > 0 ? '+' : ''}${px(delta)}`, kind: 'dist' })
  }
  return out
}

/** Distances from each edge of `inner` to the same edge of `outer`: labelled as distances, not padding or margin. */
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

const any = (s: Sides) => s.top !== 0 || s.right !== 0 || s.bottom !== 0 || s.left !== 0

/** One label per non-zero side, centred in the band between `inner` and `outer`. */
function bandLabels(inner: Rect, outer: Rect, s: Sides, kind: 'pad' | 'mar'): Label[] {
  const out: Label[] = []
  if (s.top) out.push({ x: centerX(inner), y: (outer.y + inner.y) / 2, text: px(s.top), kind })
  if (s.right) out.push({ x: (right(inner) + right(outer)) / 2, y: centerY(inner), text: px(s.right), kind })
  if (s.bottom) out.push({ x: centerX(inner), y: (bottom(inner) + bottom(outer)) / 2, text: px(s.bottom), kind })
  if (s.left) out.push({ x: (outer.x + inner.x) / 2, y: centerY(inner), text: px(s.left), kind })
  return out
}

/** Padding as a dashed box inside the border and margin as one outside, each side labelled when it is not zero. */
export function boxGuides(r: Rect, box: BoxModel): Drawing {
  const out = empty()
  const { border: b, padding: p, margin: m } = box
  if (any(p)) {
    const edge = { x: r.x + b.left, y: r.y + b.top, width: r.width - b.left - b.right, height: r.height - b.top - b.bottom }
    const content = { x: edge.x + p.left, y: edge.y + p.top, width: edge.width - p.left - p.right, height: edge.height - p.top - p.bottom }
    out.boxes.push({ rect: edge, kind: 'padding' })
    out.labels.push(...bandLabels(content, edge, p, 'pad'))
  }
  if (any(m)) {
    const outer = { x: r.x - m.left, y: r.y - m.top, width: r.width + m.left + m.right, height: r.height + m.top + m.bottom }
    out.boxes.push({ rect: outer, kind: 'margin' })
    out.labels.push(...bandLabels(r, outer, m, 'mar'))
  }
  return out
}

export function merge(...parts: Drawing[]): Drawing {
  return {
    lines: parts.flatMap(p => p.lines),
    labels: parts.flatMap(p => p.labels),
    boxes: parts.flatMap(p => p.boxes),
  }
}

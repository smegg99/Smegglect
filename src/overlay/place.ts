// src/overlay/place.ts
// Positions a floating box beside an anchor, outside it when possible, always inside the viewport.

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export type Side = 'below' | 'above' | 'right' | 'left'

const MARGIN = 8

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function candidate(anchor: Box, w: number, h: number, side: Side, gap: number): Box {
  if (side === 'below') return { x: anchor.x, y: anchor.y + anchor.height + gap, width: w, height: h }
  if (side === 'above') return { x: anchor.x, y: anchor.y - gap - h, width: w, height: h }
  if (side === 'right') return { x: anchor.x + anchor.width + gap, y: anchor.y, width: w, height: h }
  return { x: anchor.x - gap - w, y: anchor.y, width: w, height: h }
}

function clamp(b: Box, vw: number, vh: number): Box {
  return {
    ...b,
    x: Math.max(MARGIN, Math.min(b.x, vw - b.width - MARGIN)),
    y: Math.max(MARGIN, Math.min(b.y, vh - b.height - MARGIN)),
  }
}

function fits(b: Box, vw: number, vh: number): boolean {
  return b.x >= MARGIN && b.y >= MARGIN && b.x + b.width <= vw - MARGIN && b.y + b.height <= vh - MARGIN
}

/** Tries each side in order; the first that fits without covering `avoid` wins, else the clamped first side. */
export function place(anchor: Box, size: { width: number, height: number }, viewport: { width: number, height: number },
  order: readonly Side[] = ['below', 'above', 'right', 'left'], avoid: readonly Box[] = [], gap = 8): Box {
  const { width: vw, height: vh } = viewport
  for (const side of order) {
    const raw = candidate(anchor, size.width, size.height, side, gap)
    // Slide along the edge into the viewport, but never back over the anchor.
    const slid = side === 'below' || side === 'above'
      ? { ...raw, x: Math.max(MARGIN, Math.min(raw.x, vw - raw.width - MARGIN)) }
      : { ...raw, y: Math.max(MARGIN, Math.min(raw.y, vh - raw.height - MARGIN)) }
    if (fits(slid, vw, vh) && !avoid.some(a => overlaps(slid, a))) return slid
  }
  // Nothing fits cleanly: allow covering the anchor, but still keep clear of the avoided surfaces.
  for (const side of order) {
    const clamped = clamp(candidate(anchor, size.width, size.height, side, gap), vw, vh)
    if (!avoid.some(a => overlaps(clamped, a))) return clamped
  }
  const first = order[0] ?? 'below'
  return clamp(candidate(anchor, size.width, size.height, first, gap), vw, vh)
}

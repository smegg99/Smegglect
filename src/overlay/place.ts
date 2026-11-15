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

function candidate(anchor: Box, width: number, height: number, side: Side, gap: number): Box {
  if (side === 'below') return { x: anchor.x, y: anchor.y + anchor.height + gap, width, height }
  if (side === 'above') return { x: anchor.x, y: anchor.y - gap - height, width, height }
  if (side === 'right') return { x: anchor.x + anchor.width + gap, y: anchor.y, width, height }
  return { x: anchor.x - gap - width, y: anchor.y, width, height }
}

function clamp(box: Box, vw: number, vh: number): Box {
  return {
    ...box,
    x: Math.max(MARGIN, Math.min(box.x, vw - box.width - MARGIN)),
    y: Math.max(MARGIN, Math.min(box.y, vh - box.height - MARGIN)),
  }
}

function fits(box: Box, vw: number, vh: number): boolean {
  const inside = box.x >= MARGIN && box.y >= MARGIN
  return inside && box.x + box.width <= vw - MARGIN && box.y + box.height <= vh - MARGIN
}

/** Tries each side in order; the first that fits wins, else the first side clamped into the viewport. */
export function place(
  anchor: Box,
  size: { width: number, height: number },
  viewport: { width: number, height: number },
  order: readonly Side[] = ['below', 'above', 'right', 'left'],
  gap = 8,
): Box {
  const { width: vw, height: vh } = viewport
  for (const side of order) {
    const raw = candidate(anchor, size.width, size.height, side, gap)
    // Slide along the edge into the viewport, but never back over the anchor.
    const slid = side === 'below' || side === 'above'
      ? { ...raw, x: Math.max(MARGIN, Math.min(raw.x, vw - raw.width - MARGIN)) }
      : { ...raw, y: Math.max(MARGIN, Math.min(raw.y, vh - raw.height - MARGIN)) }
    if (fits(slid, vw, vh)) return slid
  }
  const first = order[0] ?? 'below'
  return clamp(candidate(anchor, size.width, size.height, first, gap), vw, vh)
}

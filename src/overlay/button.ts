// src/overlay/button.ts
// Where the button sits on its edge and which way the toolbar unfolds from it,
// so the button never moves. Pure.

import type { Placement } from './settings'

/** Distance from the viewport edge to the button. */
export const BUTTON_EDGE = 12
/** Pointer travel before a press on the button becomes a drag instead of a click. */
export const DRAG_SLOP = 4

export interface Spot {
  placement: Placement
  /** Share of the edge's length, 0 at the left or top end. */
  offset: number
}

interface Size {
  width: number
  height: number
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** The edge nearest to a point and where along it the point lies. */
export function nearestSpot(point: { x: number, y: number }, viewport: Size): Spot {
  const { width, height } = viewport
  const gaps: [Placement, number][] = [
    ['bottom', height - point.y], ['top', point.y], ['left', point.x], ['right', width - point.x],
  ]
  const placement = gaps.reduce((nearest, gap) => (gap[1] < nearest[1] ? gap : nearest))[0]
  const across = placement === 'top' || placement === 'bottom'
  return { placement, offset: clamp(across ? point.x / width : point.y / height, 0, 1) }
}

/** Centre of a square button of side `size` at the spot, kept wholly inside the viewport. */
export function buttonCentre(spot: Spot, viewport: Size, size: number): { x: number, y: number } {
  const { width, height } = viewport
  const half = size / 2
  const along = (length: number) => clamp(
    spot.offset * length,
    BUTTON_EDGE + half,
    length - BUTTON_EDGE - half,
  )
  if (spot.placement === 'top') return { x: along(width), y: BUTTON_EDGE + half }
  if (spot.placement === 'left') return { x: BUTTON_EDGE + half, y: along(height) }
  if (spot.placement === 'right') return { x: width - BUTTON_EDGE - half, y: along(height) }
  return { x: along(width), y: height - BUTTON_EDGE - half }
}

export interface Unfold {
  /** Fixed-position style: anchored at the button's outer corner, so growing never moves the button. */
  style: Record<string, string>
  vertical: boolean
  /** The tools sit before the button on screen (left of it, or above it). */
  reversed: boolean
}

/** The length along the edge the toolbar has from the button's far side, toward the side with more room. */
export function room(spot: Spot, viewport: Size, size: number): number {
  const centre = buttonCentre(spot, viewport, size)
  const half = size / 2
  const vertical = spot.placement === 'left' || spot.placement === 'right'
  const [at, length] = vertical ? [centre.y, viewport.height] : [centre.x, viewport.width]
  return (at > length / 2 ? at + half : length - at + half) - BUTTON_EDGE
}

/**
 * The shortest a line of `keys` keys of height `row` can be, as surfaces.css draws it: 3 px padding and
 * a 1 px frame at each end and a 2 px gap between keys. The rules a wrapped toolbar drops are left out.
 */
export function lineLength(keys: number, row: number): number {
  return 8 + keys * row + 2 * (keys - 1)
}

/**
 * The toolbar grows from the button toward the side with more room
 * and wraps away from the edge when it runs out.
 */
export function unfold(spot: Spot, viewport: Size, size: number): Unfold {
  const { width, height } = viewport
  const centre = buttonCentre(spot, viewport, size)
  const half = size / 2
  const px = (value: number) => `${Math.round(value)}px`
  const vertical = spot.placement === 'left' || spot.placement === 'right'
  const style: Record<string, string> = {}
  const reversed = vertical ? centre.y > height / 2 : centre.x > width / 2
  if (vertical) {
    if (reversed) style.bottom = px(height - centre.y - half)
    else style.top = px(centre.y - half)
    style.maxHeight = px(room(spot, viewport, size))
  }
  else {
    if (reversed) style.right = px(width - centre.x - half)
    else style.left = px(centre.x - half)
    style.maxWidth = px(room(spot, viewport, size))
  }
  style[spot.placement] = px(BUTTON_EDGE)
  return { style, vertical, reversed }
}

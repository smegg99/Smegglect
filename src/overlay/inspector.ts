// src/overlay/inspector.ts
// Where the inspector goes: a drawer out of the toolbar, as wide as it, on the side away from the edge. Pure.

import type { Rect } from '../core/model'
import type { Placement } from './settings'

/** Wide enough for three tab names in Polish, the Settings tab and Close in one strip. */
export const INSPECTOR_WIDTH = 384
/** Below this viewport width the drawer reaches less far, so the page keeps some room. */
export const NARROW = 720
export const EDGE = 8
/** How far the drawer reaches from its toolbar, as a share of the viewport's height. */
const REACH = 0.6
const NARROW_REACH = 0.45
const MIN_REACH = 240

export interface PanelLayout {
  /** The toolbar's edge; the drawer opens from the toolbar away from it. */
  edge: Placement
  box: Rect
}

interface Size {
  width: number
  height: number
}

/** Where the toolbar is drawn, the dragged edge mid-drag; the drawer follows it. */
export interface DockSpot {
  box: Rect
  placement: Placement
  /** The toolbar grew up or left from its button: the drawer ends where it ends. */
  reversed: boolean
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Before the toolbar is measured: the button's default spot, the middle of the bottom edge. */
const unmeasured = (viewport: Size): DockSpot => ({
  box: { x: viewport.width / 2, y: viewport.height - EDGE, width: 0, height: 0 },
  placement: 'bottom',
  reversed: false,
})

/** On the top or bottom edge: as wide as the toolbar (at least the panel's width), centred on it. */
function across(viewport: Size, dock: DockSpot, reach: number): Rect {
  const { box, placement } = dock
  const width = Math.min(Math.max(box.width, INSPECTOR_WIDTH), viewport.width - EDGE * 2)
  const x = clamp(box.x + box.width / 2 - width / 2, EDGE, viewport.width - EDGE - width)
  const below = box.y + box.height + EDGE
  const room = placement === 'bottom' ? box.y - EDGE * 2 : viewport.height - EDGE - below
  const height = Math.min(room, reach)
  return { x, y: placement === 'bottom' ? box.y - EDGE - height : below, width, height }
}

/** On a side edge: beside the toolbar, from where it starts, as long as it and no shorter than the reach. */
function beside(viewport: Size, dock: DockSpot, reach: number): Rect {
  const { box, placement, reversed } = dock
  const room = placement === 'left' ? viewport.width - EDGE - (box.x + box.width + EDGE) : box.x - EDGE * 2
  const width = Math.min(INSPECTOR_WIDTH, room)
  const x = placement === 'left' ? box.x + box.width + EDGE : box.x - EDGE - width
  const height = Math.min(Math.max(box.height, reach), viewport.height - EDGE * 2)
  const start = reversed ? box.y + box.height - height : box.y
  return { x, y: clamp(start, EDGE, viewport.height - EDGE - height), width, height }
}

/** One size whatever the drawer shows; it moves only with the toolbar. */
export function panelLayout(viewport: Size, dock: DockSpot | null): PanelLayout {
  const spot = dock ?? unmeasured(viewport)
  const share = viewport.width < NARROW ? NARROW_REACH : REACH
  const reach = Math.max(MIN_REACH, Math.round(viewport.height * share))
  const flat = spot.placement === 'top' || spot.placement === 'bottom'
  return { edge: spot.placement, box: flat ? across(viewport, spot, reach) : beside(viewport, spot, reach) }
}

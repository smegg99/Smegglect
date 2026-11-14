// src/overlay/inspector.ts
// Where the inspector goes: beside the page and around the dock, which never moves for it. Pure.

import type { Rect } from '../core/model'
import type { Placement } from './settings'

export const INSPECTOR_WIDTH = 360
export const REPORT_WIDTH = 720
/** Below this viewport width the inspector is a sheet at the top or bottom edge. */
export const NARROW = 720
export const EDGE = 8
const SHEET = 0.55
/** Below this a sheet is too small to use; it then covers part of a very tall selection. */
const MIN_SHEET = 160

export type Side = 'left' | 'right'

export interface PanelLayout {
  kind: 'side' | 'sheet'
  edge: 'left' | 'right' | 'top' | 'bottom'
  box: Rect
}

interface Size {
  width: number
  height: number
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

function sideBox(viewport: Size, side: Side, width: number, height = viewport.height - EDGE * 2): Rect {
  return { x: side === 'right' ? viewport.width - EDGE - width : EDGE, y: EDGE, width, height }
}

/** Where the dock is; it never moves for the panel, so the panel fits around it. */
export interface DockSpot {
  box: Rect
  placement: Placement
}

export function panelLayout(viewport: Size, side: Side, opts: { wide: boolean, selection: Rect | null, peek: boolean, head: number, dock?: DockSpot | null }): PanelLayout {
  const dock = opts.dock ?? null
  const across = dock?.placement === 'top' || dock?.placement === 'bottom'
  // A dock on the left or right edge takes that edge; one at the top or bottom takes it where they meet.
  const left = dock?.placement === 'left' ? dock.box.x + dock.box.width + EDGE : EDGE
  const right = dock?.placement === 'right' ? dock.box.x - EDGE : viewport.width - EDGE
  const span = (x: number, width: number) => {
    let top = EDGE
    let bottom = viewport.height - EDGE
    if (dock && across && dock.box.x < x + width && x < dock.box.x + dock.box.width) {
      if (dock.placement === 'bottom') bottom = dock.box.y - EDGE
      else top = dock.box.y + dock.box.height + EDGE
    }
    return { top, bottom }
  }
  if (viewport.width >= NARROW) {
    const width = Math.min(opts.wide ? REPORT_WIDTH : INSPECTOR_WIDTH, right - left)
    const x = side === 'right' ? right - width : left
    const { top, bottom } = span(x, width)
    // While the page is being clicked the panel keeps only its header, so nothing under it is out of reach.
    return { kind: 'side', edge: side, box: { x, y: top, width, height: opts.peek ? opts.head : bottom - top } }
  }
  const { top, bottom } = span(left, right - left)
  const s = opts.selection
  // The sheet takes the edge with more free space and fits into it, so the selection stays visible.
  const above = s ? s.y - top : 0
  const below = s ? bottom - s.y - s.height : bottom - top
  const edge = above > below ? 'top' : 'bottom'
  const room = Math.max(above, below) - EDGE
  const height = opts.peek ? opts.head : Math.max(MIN_SHEET, Math.min(Math.floor(viewport.height * SHEET), room, bottom - top))
  const y = edge === 'top' ? top : bottom - height
  return { kind: 'sheet', edge, box: { x: left, y, width: right - left, height } }
}

/** The other side when the selection lies under the panel and would be free there. */
export function sideFor(side: Side, selection: Rect | null, viewport: Size): Side {
  if (!selection || viewport.width < NARROW) return side
  const width = Math.min(INSPECTOR_WIDTH, viewport.width - EDGE * 2)
  const other: Side = side === 'right' ? 'left' : 'right'
  if (!overlaps(sideBox(viewport, side, width), selection)) return side
  return overlaps(sideBox(viewport, other, width), selection) ? side : other
}

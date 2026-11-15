// src/dom/engine/same.ts
// Whether two geometry samples draw the same, compared field by field: it runs every frame while measuring.

import type { Rect } from '../../core/model'
import type { BoxModel, Readout, Sides } from '../boxmodel'
import { sameRect } from '../live'
import type { Pin } from '../pins'
import type { Geometry, Hovered, HoveredSpace } from './types'

function sameSides(first: Sides, second: Sides): boolean {
  return first.top === second.top
    && first.right === second.right
    && first.bottom === second.bottom
    && first.left === second.left
}

function sameBox(first: BoxModel | undefined, second: BoxModel | undefined): boolean {
  if (!first || !second) return first === second
  return sameSides(first.margin, second.margin)
    && sameSides(first.border, second.border)
    && sameSides(first.padding, second.padding)
}

function sameFont(first: Readout['font'], second: Readout['font']): boolean {
  return first.family === second.family
    && first.size === second.size
    && first.weight === second.weight
    && first.lineHeight === second.lineHeight
}

function sameReadout(first: Readout | null, second: Readout | null): boolean {
  if (!first || !second) return first === second
  return sameRect(first, second)
    && sameBox(first.box, second.box)
    && sameFont(first.font, second.font)
    && first.color === second.color
    && first.background === second.background
}

function sameRects(first: readonly Rect[], second: readonly Rect[]): boolean {
  return first.length === second.length && first.every((rect, i) => sameRect(rect, second[i]))
}

function samePin(first: Pin, second: Pin | undefined): boolean {
  if (!second) return false
  return first.id === second.id
    && first.seq === second.seq
    && first.status === second.status
    && sameRect(first.rect, second.rect)
    && sameRect(first.b, second.b)
}

function samePins(first: readonly Pin[], second: readonly Pin[]): boolean {
  return first.length === second.length && first.every((pin, i) => samePin(pin, second[i]))
}

function sameSpace(first: HoveredSpace | undefined, second: HoveredSpace | undefined): boolean {
  return first?.name === second?.name && sameRect(first?.rect, second?.rect)
}

/** The hovered element draws the same: label, place, box, relation, space; boundary goes with the label. */
function sameHovered(first: Hovered | null, second: Hovered | null): boolean {
  return first?.chip === second?.chip
    && sameRect(first?.rect, second?.rect)
    && sameBox(first?.box, second?.box)
    && first?.relation === second?.relation
    && sameSpace(first?.space, second?.space)
}

/** The region being dragged is left out: dragging sets it directly. */
export function sameGeometry(previous: Geometry, next: Geometry): boolean {
  return sameRect(previous.a, next.a)
    && sameRects(previous.members, next.members)
    && sameHovered(previous.candidate, next.candidate)
    && sameReadout(previous.readout, next.readout)
    && samePins(previous.pins, next.pins)
}

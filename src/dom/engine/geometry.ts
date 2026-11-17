// src/dom/engine/geometry.ts
// Live geometry: what the tracker follows, and one sample of the selection, the hovered element and the pins.

import { shift, union } from '../../core/geometry'
import type { Rect } from '../../core/model'
import { ownsPointer } from '../../core/modes'
import { anchoredRect } from '../anchor'
import { boxModel, composedContains, readout } from '../boxmodel'
import { rendered } from '../capture'
import { boundaryOf, chipOf, describe } from '../describe'
import { heldTotal } from '../issue'
import { rectOrNull, sameRect, type Tracked } from '../live'
import { pageKey } from '../pins'
import { spaceAt, spaceName, type SpaceHit } from '../spaces'
import { selectedElements, type EngineBase } from './context'
import { sameGeometry } from './same'
import type { Geometry, HoverRelation, Hovered, HoveredSpace } from './types'

const isRect = (rect: Rect | null): rect is Rect => rect !== null

/** What the tracker follows now. Collapsed to the launcher nothing is drawn, so nothing is tracked. */
export function tracked(context: EngineBase): Tracked {
  const state = context.store.get()
  const { selection } = state.inspect
  // A region's anchor is watched as a selected element is: the region goes where it goes.
  const anchor = selection.kind === 'region' ? selection.anchor?.handle : undefined
  const elements = anchor ? [...selectedElements(context), anchor] : selectedElements(context)
  const drawn = state.expanded && state.annotations && state.drafts.issues.length > 0
  const region = selection.kind === 'region'
  const anything = elements.length > 0
    || region
    || ownsPointer(state.inspect.mode)
    || drawn
    || (state.measuring && context.live.hovered !== null)
  const continuous = state.expanded && state.measuring && elements.length > 0
  // The plates' targets are watched too: one hidden or shown with its view resizes, and nothing else changes.
  const watched = drawn ? [...elements, ...context.pins.targets()] : elements
  // A view switched by the host adds and removes nodes: plates and a region drawn on it go with it.
  // A selection too: the page replacing its elements (a hot update) is how it is found again (inspect.ts).
  const structure = drawn || selection.kind !== 'none'
  return { elements: watched, continuous, structure, any: state.expanded && anything }
}

/** Whether `outer` holds all of `inner`. */
function holds(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}

/** By the elements for one selected element, by the rectangles for a group or a region. */
function relationOf(context: EngineBase, element: Element, rect: Rect, selected: Rect): HoverRelation {
  const selection = context.store.get().inspect.selection
  if (selection.kind === 'dom') {
    if (element === selection.handle) return 'self'
    if (composedContains(selection.handle, element)) return 'inside'
    return composedContains(element, selection.handle) ? 'contains' : 'apart'
  }
  if (sameRect(rect, selected)) return 'self'
  if (holds(selected, rect)) return 'inside'
  return holds(rect, selected) ? 'contains' : 'apart'
}

/** The space under the pointer in the hovered element, found again only when the pointer or element moved. */
function spaceUnder(context: EngineBase, element: Element): HoveredSpace | undefined {
  const { live } = context
  const pointer = live.pointer
  if (!pointer) return undefined
  const known = live.space
  const fresh = known?.element === element && known.x === pointer.x && known.y === pointer.y
  const hit: SpaceHit | null = fresh && known ? known.hit : spaceAt(element, pointer.x, pointer.y)
  live.space = { element, x: pointer.x, y: pointer.y, hit }
  return hit ? { name: spaceName(hit), size: hit.size, rect: hit.rect } : undefined
}

function hoveredOf(context: EngineBase, selected: Rect | null): Hovered | null {
  const { live, attributes } = context
  const element = live.hovered
  const rect = rectOrNull(element)
  if (!element || !rect) return null
  // The label reads text and walks siblings: once per hovered element, not once per frame.
  if (live.described?.element !== element) {
    live.described = { element, chip: chipOf(describe(element, attributes)), boundary: boundaryOf(element) }
  }
  const measuring = context.store.get().measuring
  return {
    rect,
    chip: live.described.chip,
    boundary: live.described.boundary,
    box: measuring ? boxModel(element) : undefined,
    relation: measuring && selected ? relationOf(context, element, rect, selected) : undefined,
    space: measuring ? spaceUnder(context, element) : undefined,
  }
}

/**
 * A region in viewport coordinates, only on the page and screen it was drawn on: on its anchor while that is
 * on the page and has a box, else where it was drawn in the document. Else the selection.
 */
function selectedRect(context: EngineBase, members: Rect[]): Rect | null {
  const { store, win, options } = context
  const selection = store.get().inspect.selection
  if (selection.kind !== 'region') return members.length ? union(members) : null
  const here = pageKey(win, options.screen?.())
  if (selection.page !== undefined && selection.page !== here) return null
  const { anchor, rect } = selection
  if (anchor?.handle.isConnected && rendered(anchor.handle)) return anchoredRect(anchor, rect)
  return shift(rect, -win.scrollX, -win.scrollY)
}

/** Reads the page once and publishes the geometry when it draws differently from the last sample. */
/** A region's count drops as the elements it found leave the page, as the issue made from it will. */
function recount(context: EngineBase): void {
  const state = context.store.get()
  const { selection } = state.inspect
  const selected = state.selected
  const shown = selected?.contents
  if (selection.kind !== 'region' || !selection.contents || !selected || !shown) return
  const count = heldTotal(selection.contents)
  if (count === shown.count) return
  context.store.set({ ...state, selected: { ...selected, contents: { ...shown, count } } })
}

export function sample(context: EngineBase): void {
  recount(context)
  const { store, geometry, win, pins, options } = context
  const state = store.get()
  const { selection, mode } = state.inspect
  const members = selectedElements(context).map(element => rectOrNull(element)).filter(isRect)
  const selected = selectedRect(context, members)
  const previous = geometry.get()
  const dragging = mode.kind === 'region' && !!mode.start
  const showPins = state.expanded && state.annotations
  const next: Geometry = {
    candidate: hoveredOf(context, selected),
    a: selected,
    members: selection.kind === 'group' ? members : [],
    region: dragging ? previous.region : null,
    pins: showPins ? pins.sample(state.drafts.issues, win, options.screen?.()) : [],
    readout: selection.kind === 'dom' && rendered(selection.handle) ? readout(selection.handle) : null,
  }
  if (!sameGeometry(previous, next)) geometry.set(next)
}

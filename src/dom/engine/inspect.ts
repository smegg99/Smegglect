// src/dom/engine/inspect.ts
// The inspect state: modes and the selection, what is selected, the hover that follows it while measuring,
// and the selection described for an agent.

import { shift } from '../../core/geometry'
import type { ContentsMode, Rect } from '../../core/model'
import { reduce, type InspectEvent, type InspectState, type Mode, type Point } from '../../core/modes'
import { cleanLocation } from '../../core/redact'
import { readout } from '../boxmodel'
import { pageConditions, type SelectionReport } from '../check'
import { regionContents } from '../contents'
import { boundaryOf, chipOf, describe, parentOf, pickable } from '../describe'
import type { Operand } from '../issue'
import { pageKey } from '../pins'
import { sourceOf } from '../providers'
import { patch, type EngineBase, type EngineContext } from './context'
import { sample } from './geometry'
import type { Engine, SelectedInfo } from './types'

/** A region smaller than this on either side is a click, not a drag. */
const MIN_REGION = 4

/** Modes in which a click on the page picks. */
const PICKING: ReadonlySet<Mode['kind']> = new Set(['reference', 'anchor', 'pick'])

/** Modes that wait for the click a preset asked for. */
export const choosing = (mode: Mode) => mode.kind === 'reference' || mode.kind === 'anchor'

function selectedInfo(context: EngineBase, state: InspectState<Element>): SelectedInfo | null {
  const selection = state.selection
  if (selection.kind === 'none') return null
  if (selection.kind === 'region') {
    const held = selection.contents
    const contents = held ? { contents: { mode: held.mode, count: held.total } } : {}
    return { kind: 'region', chips: [], descriptors: [], canEscalate: false, ...contents }
  }
  const elements = selection.kind === 'dom' ? [selection.handle] : selection.handles
  const descriptors = elements.map(element => describe(element, context.attributes))
  const single = selection.kind === 'dom' ? selection.handle : null
  const parent = single ? parentOf(single) : null
  return {
    kind: selection.kind,
    chips: descriptors.map(chipOf),
    descriptors,
    boundary: single ? boundaryOf(single) : undefined,
    canEscalate: !!parent && parent.localName !== 'html',
  }
}

export function syncHover(context: EngineContext): void {
  const state = context.store.get()
  if (state.measuring && state.expanded && !context.picker.active()) context.hover.start()
  else context.hover.stop()
}

/** While measuring, a move inside the same element can still change the space under the pointer. */
export function onHover(context: EngineContext, element: Element | null, point?: Point): void {
  const next = element ? pickable(element) : null
  if (point) context.live.pointer = point
  const spaceMayChange = point !== undefined && context.store.get().measuring
  if (next === context.live.hovered && !spaceMayChange) return
  context.live.hovered = next
  context.tracker.sync()
  sample(context)
}

export function setInspect(context: EngineContext, next: InspectState<Element>): void {
  const current = context.store.get()
  if (next === current.inspect) return
  const selectionChanged = next.selection !== current.inspect.selection
  if (selectionChanged) context.live.draft = null
  context.store.set({
    ...current,
    inspect: next,
    // Measuring and drawing a region are never on together: drawing one turns measuring off.
    measuring: next.mode.kind === 'region' ? false : current.measuring,
    // Building a group lasts as long as picking does.
    extend: next.mode.kind !== 'pass' && current.extend,
    selected: selectionChanged ? selectedInfo(context, next) : current.selected,
    space: selectionChanged ? null : current.space,
    composing: selectionChanged ? null : current.composing,
  })
  if (PICKING.has(next.mode.kind)) context.picker.start()
  else context.picker.stop()
  syncHover(context)
  if (!choosing(next.mode)) context.live.pending = null
  context.tracker.sync()
  sample(context)
}

export function dispatch(context: EngineContext, event: InspectEvent<Element>): void {
  setInspect(context, reduce(context.store.get().inspect, event))
}

/** The selection as the operand A of an issue. */
export function operandA(context: EngineBase): Operand | null {
  const selection = context.store.get().inspect.selection
  if (selection.kind === 'dom') return { kind: 'dom', element: selection.handle }
  if (selection.kind === 'group') {
    return { kind: 'group', elements: selection.handles, anchor: selection.anchor }
  }
  if (selection.kind === 'region') {
    const { rect, contents } = selection
    return { kind: 'region', rect, frame: 'document', ...(contents ? { contents } : {}) }
  }
  return null
}

export function setMeasuring(context: EngineContext, on: boolean): void {
  const { mode, selection } = context.store.get().inspect
  if (on && mode.kind === 'region') setInspect(context, { mode: { kind: 'pass' }, selection })
  patch(context, { measuring: on })
  syncHover(context)
  context.tracker.sync()
  sample(context)
}

function escalate(context: EngineContext): void {
  const { mode, selection } = context.store.get().inspect
  if (selection.kind !== 'dom') return
  const parent = parentOf(selection.handle)
  if (!parent || parent.localName === 'html') return
  setInspect(context, { mode, selection: { kind: 'dom', handle: parent } })
}

/** Ends a drag: `rect` is in viewport coordinates, which the page's elements are compared in. */
function regionEnd(context: EngineContext, rect: Rect, mode: ContentsMode): void {
  const { geometry, store, win, options } = context
  geometry.set({ ...geometry.get(), region: null })
  if (rect.width < MIN_REGION || rect.height < MIN_REGION) {
    setInspect(context, { mode: { kind: 'region' }, selection: store.get().inspect.selection })
    return
  }
  const page = pageKey(win, options.screen?.())
  // The mode stays with the region even when it found nothing, so the panel can say so.
  const found = regionContents(context.doc, rect, mode)
  const contents = { mode, handles: found.elements, total: found.total }
  dispatch(context, { type: 'drag-end', rect: shift(rect, win.scrollX, win.scrollY), page, contents })
}

async function describeSelection(context: EngineBase): Promise<SelectionReport> {
  const { win, doc, options, attributes } = context
  const selection = context.store.get().inspect.selection
  const page = { location: cleanLocation(win.location.href), conditions: pageConditions(doc) }
  if (selection.kind === 'none') return { status: 'none', ...page }
  const drawn = context.geometry.get()
  if (selection.kind === 'region') return { status: 'live', ...page, kind: 'region', bounds: drawn.a }
  const elements = selection.kind === 'dom' ? [selection.handle] : selection.handles
  const descriptors = elements.map(element => describe(element, attributes))
  const targets = descriptors.map(chipOf)
  const { kind } = selection
  const report: SelectionReport = { status: 'live', ...page, kind, targets, descriptors, bounds: drawn.a }
  if (selection.kind === 'group') return { ...report, members: drawn.members }
  const source = await sourceOf(selection.handle, options.sources ?? [])
  return { ...report, box: readout(selection.handle), source }
}

type InspectApi = Pick<Engine,
  | 'togglePick' | 'toggleRegion' | 'setExtend' | 'clear' | 'drop' | 'escalate'
  | 'regionStart' | 'regionDraft' | 'regionEnd'
  | 'setMeasuring' | 'setAnnotations' | 'describeSelection'
>

export function inspectApi(context: EngineContext): InspectApi {
  const { geometry } = context
  return {
    togglePick: () => dispatch(context, { type: 'toggle-pick' }),
    toggleRegion: () => dispatch(context, { type: 'toggle-region' }),
    setExtend: on => patch(context, { extend: on }),
    regionStart: point => dispatch(context, { type: 'drag-start', point }),
    regionDraft: rect => geometry.set({ ...geometry.get(), region: rect }),
    regionEnd: (rect, mode) => regionEnd(context, rect, mode),
    clear: () => dispatch(context, { type: 'clear' }),
    drop: index => dispatch(context, { type: 'drop', index }),
    escalate: () => escalate(context),
    setMeasuring: on => setMeasuring(context, on),
    setAnnotations(on) {
      patch(context, { annotations: on })
      context.tracker.sync()
      sample(context)
    },
    describeSelection: () => describeSelection(context),
  }
}

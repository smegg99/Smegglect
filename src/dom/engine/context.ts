// src/dom/engine/context.ts
// What the engine's parts share, as one object: fixed services, the two stores, and the values that change.

import { emptyDrafts } from '../../core/drafts'
import type { BoundaryKind } from '../../core/model'
import { initial, type Point } from '../../core/modes'
import { createRegistry, type PresetDef, type PresetRegistry } from '../../core/presets'
import { DEFAULT_TEST_ATTRIBUTES } from '../describe'
import type { Operand } from '../issue'
import type { LiveTracker } from '../live'
import type { Hover, Picker } from '../picker'
import { createPins, type Pins } from '../pins'
import { createScope, type Scope } from '../scope'
import type { Session } from '../session'
import type { SpaceHit } from '../spaces'
import { createStore, type Store } from '../store'
import type { HostWindow } from '../window'
import type { KeptSelection } from './keep'
import type { EngineOptions, EngineState, Geometry, LayerOrder, Notice } from './types'

/** A preset waiting for the person to click its reference or anchor. */
interface Pending {
  preset: string
  params: Record<string, string>
}

/** The issue being composed; it is measured again when it is added. */
export interface Draft {
  def: PresetDef
  a: Operand
  b?: Operand
}

/** The hovered element's label, read once per element rather than once per frame. */
interface Described {
  element: Element
  chip: string
  boundary?: BoundaryKind
}

/**
 * Close handlers in Escape's order. `first`: menus and popovers, closed before anything else. `view`:
 * issue and report views, closed after a page-click mode, before the selection. `last`: closed only when
 * mode and selection have nothing left to cancel, e.g. the inspector.
 */
export type Layers = Record<LayerOrder, (() => void)[]>

/** The values that change while the engine runs, other than its two stores. */
export interface Live {
  /** The element under the pointer while picking or measuring. */
  hovered: Element | null
  /** Where the pointer is, for the space under it while measuring. */
  pointer: Point | null
  /** The space last found, by element and point: it is read once per pointer move, not once per frame. */
  space: { element: Element, x: number, y: number, hit: SpaceHit | null } | null
  described: Described | null
  pending: Pending | null
  draft: Draft | null
  noticeSeq: number
  destroyed: boolean
  /** The selection described when it was made, to find it again when the page replaces its elements. */
  kept: KeptSelection | null
  /** The page's element count when that last failed: tried again only once the page has changed. */
  refindAt: number | null
}

/** Everything the services read; they are made from it (wiring.ts). */
export interface EngineBase {
  readonly options: EngineOptions
  readonly doc: Document
  readonly win: HostWindow
  readonly attributes: readonly string[]
  readonly registry: PresetRegistry
  readonly scope: Scope
  readonly store: Store<EngineState>
  readonly geometry: Store<Geometry>
  readonly pins: Pins
  readonly layers: Layers
  readonly live: Live
  readonly onError: (error: unknown) => void
}

/** The parts that call back into the engine. */
export interface Services {
  readonly tracker: LiveTracker
  readonly picker: Picker
  readonly hover: Hover
  readonly session: Session
}

export interface EngineContext extends EngineBase, Services {}

function initialState(): EngineState {
  return {
    inspect: initial<Element>(),
    space: null,
    extend: false,
    measuring: false,
    annotations: true,
    composing: null,
    drafts: emptyDrafts(),
    selected: null,
    notice: null,
    expanded: false,
    focusRequest: 0,
  }
}

function emptyGeometry(): Geometry {
  return { candidate: null, a: null, members: [], region: null, pins: [], readout: null }
}

export function createBase(options: EngineOptions): EngineBase {
  const doc = options.document
  const win = doc.defaultView as HostWindow | null
  if (!win) throw new Error('smegglect: the document has no window')
  const onError = options.onError ?? ((error: unknown) => win.console.error('smegglect:', error))
  const attributes = options.testAttributes ?? DEFAULT_TEST_ATTRIBUTES
  return {
    options,
    doc,
    win,
    attributes,
    onError,
    registry: createRegistry(options.presets ?? []),
    scope: createScope(win),
    store: createStore<EngineState>(initialState(), onError),
    geometry: createStore<Geometry>(emptyGeometry(), onError),
    pins: createPins(doc, attributes),
    layers: { first: [], view: [], last: [] },
    live: {
      hovered: null,
      pointer: null,
      space: null,
      described: null,
      pending: null,
      draft: null,
      noticeSeq: 0,
      destroyed: false,
      kept: null,
      refindAt: null,
    },
  }
}

export function patch(context: EngineBase, change: Partial<EngineState>): void {
  context.store.update(state => ({ ...state, ...change }))
}

export function notify(context: EngineBase, value: Notice): void {
  context.live.noticeSeq++
  const notice = { id: context.live.noticeSeq, value }
  context.store.update(state => ({ ...state, notice }))
}

/** The elements of a dom or group selection; none without a selection. */
export function selectedElements(context: EngineBase): Element[] {
  const selection = context.store.get().inspect.selection
  if (selection.kind === 'dom') return [selection.handle]
  if (selection.kind === 'group') return selection.handles
  return []
}

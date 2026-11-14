// src/dom/engine.ts
// Headless engine: modes, selection, issues and live geometry. Any UI can drive it.

import { compare, type Comparison } from '../core/compare'
import { addIssue, editIssue, emptyDrafts, findSame, redoLast, removeIssue, undoLast, type Drafts, type IntentPatch } from '../core/drafts'
import { shift, union } from '../core/geometry'
import type { BoundaryKind, ConstraintId, ElementDescriptor, Issue, Rect, Scope, TargetKind } from '../core/model'
import { escape as escapeState, initial, ownsPointer, reduce, type InspectEvent, type InspectState, type Point } from '../core/modes'
import { createRegistry, type PresetDef, type PresetRegistry } from '../core/presets'
import { cleanLocation } from '../core/redact'
import { boundaryOf, chipOf, DEFAULT_TEST_ATTRIBUTES, describe, parentOf, pickable, under } from './describe'
import { checkIssue, type IssueCheck, type SelectionReport } from './check'
import { createIssue, measure, refOf, type Operand } from './issue'
import { createKeys } from './keys'
import { createTracker, rectOrNull, sameRect } from './live'
import { boxModel, composedContains, readout, type BoxModel, type Readout } from './boxmodel'
import { createHover, createPicker } from './picker'
import { createPins, type Pin } from './pins'
import { sourceOf, type ContextProvider, type SourceProvider } from './providers'
import { createScope } from './scope'
import { bridgeClient, type BridgeClient, type BridgeConfig } from './bridge'
import { createSession, type Session } from './session'
import type { DraftStorage } from './storage'
import { createStore } from './store'

export interface EngineOptions {
  document: Document
  /** True when an event passed through the UI that drives this engine. */
  owns: (event: Event) => boolean
  /** Called after a host top-layer element opens, so the UI can stay above it. */
  raise?: () => void
  project: { id: string, name?: string }
  presets?: readonly PresetDef[]
  testAttributes?: readonly string[]
  sources?: readonly SourceProvider[]
  context?: readonly ContextProvider[]
  /** Current route or screen name for capture conditions. */
  screen?: () => string | undefined
  /** Keyboard shortcuts on Alt+Shift; false leaves only Escape handling. */
  shortcuts?: boolean
  /** `auto`: IndexedDB with memory fallback. */
  storage?: 'auto' | 'memory' | DraftStorage
  /** Optional provider evidence for the batch, e.g. git branch; values are cleaned and bounded. */
  provider?: Record<string, string>
  /** Optional local bridge (development only); see `smegglect/bridge`. */
  bridge?: BridgeConfig
  onError?: (error: unknown) => void
}

export type Notice =
  | { kind: 'added', issueId: string, seq: number }
  | { kind: 'removed', issueId: string }
  | { kind: 'undone' }
  | { kind: 'redone' }
  | { kind: 'reference-invalid', reason: 'same' | 'member' | 'outside-group' }

export interface SelectedInfo {
  kind: 'dom' | 'group' | 'region'
  chips: string[]
  descriptors: ElementDescriptor[]
  boundary?: BoundaryKind
  canEscalate: boolean
}

/** An issue being composed: shown to the person before anything is recorded. */
export interface Composing {
  preset: string
  params: Record<string, string>
  a: { kind: TargetKind, chip: string }
  b?: { chip: string }
  /** Viewport bounds of B when there is a reference. */
  bBounds?: Rect
  /** Measured values; the issue measures again when it is added. */
  comparison: Comparison | null
  /** A draft that already reports exactly this. */
  existing: string | null
}

export interface EngineState {
  inspect: InspectState<Element>
  /** Visible alternative to Shift: picks extend the selection into a group. */
  extend: boolean
  measuring: boolean
  /** Draft issues drawn on the page. */
  annotations: boolean
  composing: Composing | null
  drafts: Drafts
  selected: SelectedInfo | null
  notice: { id: number, value: Notice } | null
  /** Expanded UI asks for shortcuts; collapsed it still answers the open shortcut. */
  expanded: boolean
  /** Incremented when the keyboard opened the dock, so the UI can move focus into it. */
  focusRequest: number
}

/** Where the hovered element sits relative to the selection while measuring. */
export type HoverRelation = 'self' | 'inside' | 'contains' | 'apart'

export interface Geometry {
  /** `box` and `relation` are present only while measuring; `relation` only with a selection. */
  candidate: { rect: Rect, chip: string, boundary?: BoundaryKind, box?: BoxModel, relation?: HoverRelation } | null
  a: Rect | null
  members: Rect[]
  region: Rect | null
  pins: Pin[]
  /** Live values of a single selected element. */
  readout: Readout | null
}

export type ApplyResult =
  | 'added'
  | 'composing'
  | 'exists'
  | 'needs-reference'
  | 'needs-anchor'
  | 'needs-choice'
  | 'needs-note'
  | 'not-applicable'
  | 'no-selection'
  | 'unknown-preset'

export interface Engine {
  readonly registry: PresetRegistry
  readonly session: Session
  readonly bridge: BridgeClient | null
  state: () => EngineState
  subscribe: (fn: (s: EngineState) => void) => () => void
  geometry: () => Geometry
  subscribeGeometry: (fn: (g: Geometry) => void) => () => void
  setExpanded: (on: boolean) => void
  togglePick: () => void
  toggleRegion: () => void
  setExtend: (on: boolean) => void
  regionStart: (p: Point) => void
  /** Live rectangle while dragging, viewport frame. */
  regionDraft: (rect: Rect) => void
  /** Viewport rectangle; stored as a document-frame region so it scrolls with the page. */
  regionEnd: (rect: Rect) => void
  escape: () => boolean
  clear: () => void
  /** Takes the group member at this place out of the selection; one left becomes a plain selection. */
  drop: (index: number) => void
  escalate: () => void
  setMeasuring: (on: boolean) => void
  setAnnotations: (on: boolean) => void
  /** Starts a preset: asks for B or an anchor when needed, then opens the issue form. Records nothing. */
  begin: (preset: string, params?: Record<string, string>) => ApplyResult
  /** Changes the issue form's choice. */
  compose: (params: Record<string, string>) => void
  /** Records the composed issue. Refuses an identical draft with `exists`. */
  commit: (input?: { note?: string, scope?: Scope, constraints?: ConstraintId[] }) => Promise<ApplyResult>
  cancelCompose: () => void
  /** begin + compose + commit in one call, for scripts and headless use. */
  apply: (preset: string, params?: Record<string, string>, note?: string) => Promise<ApplyResult>
  /** Draft issues whose target A is the current selection. */
  issuesOnSelection: () => Issue[]
  /** Scrolls the page so an issue's target is in view; false when it is not on this page. */
  reveal: (issueId: string) => boolean
  editIssue: (id: string, patch: IntentPatch) => void
  removeIssue: (id: string) => void
  undo: () => void
  redo: () => void
  replaceDrafts: (drafts: Drafts) => void
  /** Registers a UI layer (popover, issue view, report) that Escape closes; `last` layers close after mode and selection. */
  pushLayer: (close: () => void, order?: 'first' | 'view' | 'last') => () => void
  /** Object URL released after `ttl` ms or on destroy, whichever comes first. */
  objectUrl: (blob: Blob, ttl: number) => string
  /** Where an issue's target is now, without touching its captured evidence. */
  locate: (issue: Issue) => Pin['status']
  /** Sent issues the page keeps marked next to the drafts, e.g. those waiting for the person's review. */
  showSent: (issues: readonly Issue[]) => void
  /** For an agent: the issue's target found again on this page and measured now. */
  check: (issue: Issue) => IssueCheck
  /** For an agent: what is selected now, with its size, box values and source when known. */
  describeSelection: () => Promise<SelectionReport>
  destroyed: () => boolean
  destroy: () => void
}

interface Pending {
  preset: string
  params: Record<string, string>
}

interface Draft {
  def: PresetDef
  a: Operand
  b?: Operand
}

export function createEngine(options: EngineOptions): Engine {
  const doc = options.document
  const win = doc.defaultView as Window & typeof globalThis
  if (!win) throw new Error('smegglect: the document has no window')
  const onError = options.onError ?? ((e: unknown) => win.console.error('smegglect:', e))
  const attrs = options.testAttributes ?? DEFAULT_TEST_ATTRIBUTES
  const registry = createRegistry(options.presets ?? [])
  const root = createScope(win)

  const store = createStore<EngineState>({
    inspect: initial<Element>(),
    extend: false,
    measuring: false,
    annotations: true,
    composing: null,
    drafts: emptyDrafts(),
    selected: null,
    notice: null,
    expanded: false,
    focusRequest: 0,
  }, onError)
  const geo = createStore<Geometry>({ candidate: null, a: null, members: [], region: null, pins: [], readout: null }, onError)

  const session = createSession({
    win,
    project: options.project,
    storage: options.storage ?? 'auto',
    registry,
    ...(options.provider ? { provider: options.provider } : {}),
    scope: root,
    drafts: () => store.get().drafts,
    setDrafts: drafts => engine.replaceDrafts(drafts),
    onError,
  })

  let candidate: Element | null = null
  let described: { el: Element, chip: string, boundary?: BoundaryKind } | null = null
  let pending: Pending | null = null
  let draft: Draft | null = null
  let noticeSeq = 0
  let destroyed = false
  /** Menus and popovers: closed before anything else. */
  const layers: (() => void)[] = []
  /** Issue and report views: closed after a page-click mode, before the selection. */
  const viewLayers: (() => void)[] = []
  /** Closed only when mode and selection have nothing left to cancel, e.g. the inspector. */
  const lastLayers: (() => void)[] = []

  const pins = createPins(doc, attrs)

  function selectionElements(): Element[] {
    const sel = store.get().inspect.selection
    if (sel.kind === 'dom') return [sel.handle]
    if (sel.kind === 'group') return sel.handles
    return []
  }

  const tracker = createTracker(win, root, () => {
    const s = store.get()
    const els = selectionElements()
    // Collapsed to the launcher nothing is drawn, so nothing is tracked.
    const drawn = s.expanded && s.annotations && s.drafts.issues.length > 0
    const any = s.expanded && (els.length > 0 || s.inspect.selection.kind === 'region' || ownsPointer(s.inspect.mode) || drawn || (s.measuring && candidate !== null))
    return { elements: els, continuous: s.expanded && s.measuring && els.length > 0, structure: drawn, any }
  }, sample)

  let sent: Issue[] = []

  function sample() {
    const s = store.get()
    const sel = s.inspect.selection
    const els = selectionElements()
    const members = els.map(el => rectOrNull(el)).filter((r): r is Rect => r !== null)
    const a = sel.kind === 'region' ? shift(sel.rect, -win.scrollX, -win.scrollY) : members.length ? union(members) : null
    const rect = candidate && candidate.isConnected ? rectOrNull(candidate) : null
    // The label reads text and walks siblings: once per hovered element, not once per frame.
    if (candidate && described?.el !== candidate) {
      const boundary = boundaryOf(candidate)
      described = { el: candidate, chip: chipOf(describe(candidate, attrs)), ...(boundary ? { boundary } : {}) }
    }
    const cand = candidate && rect && described
      ? {
          rect,
          chip: described.chip,
          ...(described.boundary ? { boundary: described.boundary } : {}),
          ...(s.measuring ? { box: boxModel(candidate) } : {}),
          ...(s.measuring && a ? { relation: relationOf(candidate, rect, a) } : {}),
        }
      : null
    const prev = geo.get()
    const next: Geometry = {
      candidate: cand,
      a,
      members: sel.kind === 'group' ? members : [],
      region: s.inspect.mode.kind === 'region' && s.inspect.mode.start ? prev.region : null,
      pins: s.expanded && s.annotations ? pins.sample([...s.drafts.issues, ...sent], win, options.screen?.()) : [],
      readout: sel.kind === 'dom' && sel.handle.isConnected ? readout(sel.handle) : null,
    }
    const changed = !sameRect(prev.a, next.a)
      || prev.members.length !== next.members.length || next.members.some((m, i) => !sameRect(m, prev.members[i]))
      || prev.candidate?.chip !== next.candidate?.chip || !sameRect(prev.candidate?.rect, next.candidate?.rect)
      || JSON.stringify(prev.candidate?.box) !== JSON.stringify(next.candidate?.box) || prev.candidate?.relation !== next.candidate?.relation
      || JSON.stringify(prev.readout) !== JSON.stringify(next.readout)
      || JSON.stringify(prev.pins) !== JSON.stringify(next.pins)
    if (changed) geo.set(next)
  }

  function selectedInfo(state: InspectState<Element>): SelectedInfo | null {
    const sel = state.selection
    if (sel.kind === 'none') return null
    if (sel.kind === 'region') return { kind: 'region', chips: [], descriptors: [], canEscalate: false }
    const els = sel.kind === 'dom' ? [sel.handle] : sel.handles
    const descriptors = els.map(el => describe(el, attrs))
    const boundary = sel.kind === 'dom' ? boundaryOf(sel.handle) : undefined
    const parent = sel.kind === 'dom' ? parentOf(sel.handle) : null
    return {
      kind: sel.kind,
      chips: descriptors.map(chipOf),
      descriptors,
      ...(boundary ? { boundary } : {}),
      canEscalate: !!parent && parent.localName !== 'html',
    }
  }

  function setInspect(next: InspectState<Element>) {
    const cur = store.get()
    if (next === cur.inspect) return
    const selectionChanged = next.selection !== cur.inspect.selection
    if (selectionChanged) draft = null
    // Building a group lasts as long as picking does.
    const extend = next.mode.kind === 'pass' ? false : cur.extend
    store.set({ ...cur, inspect: next, extend, selected: selectionChanged ? selectedInfo(next) : cur.selected, composing: selectionChanged ? null : cur.composing })
    if (next.mode.kind === 'reference' || next.mode.kind === 'anchor' || next.mode.kind === 'pick') picker.start()
    else picker.stop()
    syncHover()
    if (next.mode.kind !== 'reference' && next.mode.kind !== 'anchor') pending = null
    tracker.sync()
    sample()
  }

  function dispatch(event: InspectEvent<Element>) {
    setInspect(reduce(store.get().inspect, event))
  }

  function notify(value: Notice) {
    noticeSeq++
    store.update(s => ({ ...s, notice: { id: noticeSeq, value } }))
  }

  function patch(p: Partial<EngineState>) {
    store.update(s => ({ ...s, ...p }))
  }

  function composeView(d: Draft, params: Record<string, string>): Composing {
    const aEv = measure(d.a, d.def, doc, attrs)
    const bEv = d.b ? measure(d.b, d.def, doc, attrs) : undefined
    const chip = (op: Operand) => op.kind === 'dom' ? chipOf(describe(op.element, attrs)) : op.kind === 'group' ? `${op.elements.length}` : ''
    const existing = findSame(store.get().drafts, {
      intent: { preset: { id: d.def.id, version: d.def.version }, params, scope: 'occurrence', constraints: [], note: '' },
      operands: d.b ? { a: refOf(d.a, attrs), b: refOf(d.b, attrs) } : { a: refOf(d.a, attrs) },
    })
    return {
      preset: d.def.id,
      params,
      a: { kind: d.a.kind, chip: chip(d.a) },
      ...(d.b ? { b: { chip: chip(d.b) } } : {}),
      ...(bEv ? { bBounds: bEv.bounds } : {}),
      comparison: compare(d.def, params, { ...aEv, source: { quality: 'visual-only', provenance: 'none' } }, bEv ? { ...bEv, source: { quality: 'visual-only', provenance: 'none' } } : undefined),
      existing: existing?.id ?? null,
    }
  }

  function startCompose(def: PresetDef, params: Record<string, string>, a: Operand, b?: Operand) {
    draft = { def, a, ...(b ? { b } : {}) }
    patch({ composing: composeView(draft, params) })
  }

  async function record(d: Draft, params: Record<string, string>, input: { note?: string, scope?: Scope, constraints?: ConstraintId[] }): Promise<ApplyResult> {
    const issue = await createIssue({
      doc, def: d.def, params, note: input.note?.trim() ?? '', a: d.a, ...(d.b ? { b: d.b } : {}), attrs,
      ...(input.scope ? { scope: input.scope } : {}), ...(input.constraints ? { constraints: input.constraints } : {}),
      sources: options.sources ?? [], context: options.context ?? [], screen: options.screen?.(),
    })
    if (destroyed) return 'not-applicable'
    const step = addIssue(store.get().drafts, issue)
    if (step.outcome === 'exists') return 'exists'
    const added = step.drafts.issues.at(-1)!
    patch({ drafts: step.drafts, composing: null })
    draft = null
    pins.remember(added.id, d.a, d.b)
    session.changed()
    session.log({ kind: 'added', issueId: added.id, seq: added.seq, preset: added.intent.preset.id, params: added.intent.params, target: targetChip(added), location: added.evidence.capture.location })
    notify({ kind: 'added', issueId: added.id, seq: added.seq })
    tracker.sync()
    sample()
    return 'added'
  }

  function targetChip(issue: Issue): string {
    const a = issue.operands.a
    return a.kind === 'dom' ? chipOf(a.element) : a.kind === 'group' ? a.members.map(chipOf).join(', ').slice(0, 120) : 'region'
  }

  function operandA(): Operand | null {
    const sel = store.get().inspect.selection
    if (sel.kind === 'dom') return { kind: 'dom', element: sel.handle }
    if (sel.kind === 'group') return { kind: 'group', elements: sel.handles, ...(sel.anchor !== undefined ? { anchor: sel.anchor } : {}) }
    if (sel.kind === 'region') return { kind: 'region', rect: sel.rect, frame: 'document' }
    return null
  }

  async function onPick(raw: Element, event: PointerEvent) {
    const el = pickable(raw)
    const s = store.get()
    const mode = s.inspect.mode
    if (mode.kind === 'pick') {
      dispatch({ type: 'select', handle: el, extend: event.shiftKey || s.extend })
      return
    }
    if (!pending) return
    const def = registry.byId.get(pending.preset)
    const a = operandA()
    if (!def || !a) return
    if (mode.kind === 'reference') {
      const members = selectionElements()
      if (members.includes(el)) {
        notify({ kind: 'reference-invalid', reason: members.length > 1 ? 'member' : 'same' })
        return
      }
      const p = pending
      pending = null
      dispatch({ type: 'chosen' })
      startCompose(def, p.params, a, { kind: 'dom', element: el })
      return
    }
    if (mode.kind === 'anchor' && a.kind === 'group') {
      const index = a.elements.findIndex(m => m === el || m.contains(el))
      if (index < 0) {
        notify({ kind: 'reference-invalid', reason: 'outside-group' })
        return
      }
      const p = pending
      pending = null
      dispatch({ type: 'chosen' })
      // The anchor belongs to this issue only; the selection itself stays an unanchored group.
      startCompose(def, p.params, { ...a, anchor: index })
    }
  }

  const picker = createPicker(win, root, {
    owned: options.owns,
    shielded: event => options.owns(event) && event.composedPath().some(n => (n as Element).hasAttribute?.('data-shield')),
    under: (x, y) => under(doc, x, y),
    hover: onHover,
    pick: (el, event) => {
      onPick(el, event).catch(onError)
    },
  })

  // Measuring in normal use: the host keeps every event; only the element under the pointer is read.
  const hover = createHover(win, root, { owned: options.owns, hover: onHover })

  function onHover(el: Element | null) {
    const next = el ? pickable(el) : null
    if (next === candidate) return
    candidate = next
    tracker.sync()
    sample()
  }

  function syncHover() {
    const s = store.get()
    if (s.measuring && s.expanded && !picker.active()) hover.start()
    else hover.stop()
  }

  function relationOf(el: Element, rect: Rect, a: Rect): HoverRelation {
    const sel = store.get().inspect.selection
    if (sel.kind === 'dom') {
      if (el === sel.handle) return 'self'
      if (composedContains(sel.handle, el)) return 'inside'
      return composedContains(el, sel.handle) ? 'contains' : 'apart'
    }
    const holds = (o: Rect, i: Rect) => i.x >= o.x && i.y >= o.y && i.x + i.width <= o.x + o.width && i.y + i.height <= o.y + o.height
    if (sameRect(rect, a)) return 'self'
    if (holds(a, rect)) return 'inside'
    return holds(rect, a) ? 'contains' : 'apart'
  }

  /** Innermost first: a menu, the issue form, a page-click mode, an issue or report view, the selection, the inspector. */
  function escape(): boolean {
    const layer = layers.pop()
    if (layer) {
      layer()
      return true
    }
    if (store.get().composing) {
      engine.cancelCompose()
      return true
    }
    const inspect = store.get().inspect
    if (inspect.mode.kind === 'pass') {
      const view = viewLayers.pop()
      if (view) {
        view()
        return true
      }
    }
    const next = escapeState(inspect)
    if (!next) {
      const last = lastLayers.pop()
      last?.()
      return !!last
    }
    if (inspect.mode.kind === 'reference' || inspect.mode.kind === 'anchor') pending = null
    setInspect(next)
    return true
  }

  const keys = createKeys(win, root, {
    owns: options.owns,
    escape: (focusInHost) => {
      const s = store.get()
      // A bare selection is only cleared from Smegglect's own focus; host fields keep their Escape.
      if (focusInHost && !layers.length && s.inspect.mode.kind === 'pass') return false
      return escape()
    },
    shortcut(action) {
      if (action === 'toggle') {
        const open = !store.get().expanded
        engine.setExpanded(open)
        if (open) patch({ focusRequest: store.get().focusRequest + 1 })
      }
      if (!store.get().expanded) return
      if (action === 'pick') engine.togglePick()
      if (action === 'region') engine.toggleRegion()
      if (action === 'measure') engine.setMeasuring(!store.get().measuring)
      if (action === 'undo') engine.undo()
      if (action === 'redo') engine.redo()
    },
    shortcuts: options.shortcuts !== false,
  })

  // Host dialogs and popovers enter the top layer above the overlay; raise it again after them.
  if (options.raise) {
    const raise = options.raise
    root.listen(doc, 'toggle', (event: Event) => {
      if ((event as ToggleEvent).newState === 'open' && !options.owns(event)) raise()
    }, { capture: true })
  }

  const engine: Engine = {
    registry,
    session,
    bridge: options.bridge ? bridgeClient(win, options.bridge) : null,
    state: store.get,
    subscribe: store.subscribe,
    geometry: geo.get,
    subscribeGeometry: geo.subscribe,
    setExpanded(on) {
      if (on === store.get().expanded) return
      if (!on) {
        pending = null
        engine.cancelCompose()
        setInspect({ mode: { kind: 'pass' }, selection: store.get().inspect.selection })
      }
      patch({ expanded: on })
      syncHover()
      if (on) options.raise?.()
    },
    togglePick: () => dispatch({ type: 'toggle-pick' }),
    toggleRegion: () => dispatch({ type: 'toggle-region' }),
    setExtend: on => patch({ extend: on }),
    regionStart(point) {
      dispatch({ type: 'drag-start', point })
    },
    regionDraft(rect) {
      geo.set({ ...geo.get(), region: rect })
    },
    regionEnd(rect) {
      geo.set({ ...geo.get(), region: null })
      if (rect.width < 4 || rect.height < 4) {
        setInspect({ mode: { kind: 'region' }, selection: store.get().inspect.selection })
        return
      }
      dispatch({ type: 'drag-end', rect: shift(rect, win.scrollX, win.scrollY) })
    },
    escape,
    clear: () => dispatch({ type: 'clear' }),
    drop: index => dispatch({ type: 'drop', index }),
    escalate() {
      const sel = store.get().inspect.selection
      if (sel.kind !== 'dom') return
      const parent = parentOf(sel.handle)
      if (!parent || parent.localName === 'html') return
      setInspect({ mode: store.get().inspect.mode, selection: { kind: 'dom', handle: parent } })
    },
    setMeasuring(on) {
      patch({ measuring: on })
      syncHover()
      tracker.sync()
      sample()
    },
    setAnnotations(on) {
      patch({ annotations: on })
      tracker.sync()
      sample()
    },
    begin(id, params = {}) {
      const def = registry.byId.get(id)
      if (!def) return 'unknown-preset'
      const a = operandA()
      if (!a) return 'no-selection'
      if (!def.applies.includes(a.kind)) return 'not-applicable'
      const needsB = def.operands === 'reference' || (def.operands === 'compare' && a.kind !== 'group')
      if (needsB) {
        pending = { preset: id, params }
        dispatch({ type: 'need-reference', preset: id, params })
        return 'needs-reference'
      }
      if (def.id === 'group-align' && a.kind === 'group' && a.anchor === undefined) {
        pending = { preset: id, params }
        dispatch({ type: 'need-anchor', preset: id, params })
        return 'needs-anchor'
      }
      startCompose(def, params, a)
      return 'composing'
    },
    compose(params) {
      if (!draft) return
      patch({ composing: composeView(draft, params) })
    },
    async commit(input = {}) {
      const d = draft
      const c = store.get().composing
      if (!d || !c) return 'no-selection'
      if (d.def.choice && !d.def.choice.options.includes(c.params[d.def.choice.key] ?? '')) return 'needs-choice'
      if (d.def.note === 'required' && !input.note?.trim()) return 'needs-note'
      return record(d, c.params, input)
    },
    cancelCompose() {
      draft = null
      if (store.get().composing) patch({ composing: null })
    },
    async apply(id, params = {}, note = '') {
      const started = engine.begin(id, params)
      if (started !== 'composing') return started
      return engine.commit({ note })
    },
    issuesOnSelection() {
      const a = operandA()
      if (!a) return []
      const ref = JSON.stringify(refOf(a, attrs))
      return store.get().drafts.issues.filter(i => JSON.stringify(i.operands.a) === ref)
    },
    reveal(issueId) {
      const issue = store.get().drafts.issues.find(i => i.id === issueId)
      if (!issue) return false
      const pin = pins.sample([issue], win, options.screen?.())[0]
      if (!pin?.rect) return false
      const r = pin.rect
      const vh = doc.documentElement.clientHeight
      if (r.y < 0 || r.y + r.height > vh) win.scrollBy({ top: r.y - vh / 3, behavior: 'smooth' })
      return true
    },
    editIssue(id, change) {
      const step = editIssue(store.get().drafts, id, change, Date.now())
      if (step.outcome !== 'updated') return
      patch({ drafts: step.drafts })
      session.changed()
      const issue = step.drafts.issues.find(i => i.id === id)
      if (issue) session.log({ kind: 'edited', issueId: id, seq: issue.seq, preset: issue.intent.preset.id, detail: Object.keys(change).join(',') })
    },
    removeIssue(id) {
      const gone = store.get().drafts.issues.find(i => i.id === id)
      const step = removeIssue(store.get().drafts, id)
      if (step.outcome !== 'removed') return
      patch({ drafts: step.drafts })
      session.changed()
      if (gone) session.log({ kind: 'removed', issueId: id, seq: gone.seq, preset: gone.intent.preset.id, params: gone.intent.params, target: targetChip(gone) })
      notify({ kind: 'removed', issueId: id })
      sample()
    },
    undo() {
      const step = undoLast(store.get().drafts)
      if (step.outcome !== 'undone') return
      patch({ drafts: step.drafts })
      session.changed()
      session.log({ kind: 'undone' })
      notify({ kind: 'undone' })
      sample()
    },
    redo() {
      const step = redoLast(store.get().drafts)
      if (step.outcome !== 'redone') return
      patch({ drafts: step.drafts })
      session.changed()
      session.log({ kind: 'redone' })
      notify({ kind: 'redone' })
      sample()
    },
    replaceDrafts(drafts) {
      patch({ drafts })
      pins.forgetMissing([...drafts.issues, ...sent])
      tracker.sync()
      sample()
    },
    pushLayer(close, order = 'first') {
      const list = order === 'last' ? lastLayers : order === 'view' ? viewLayers : layers
      list.push(close)
      return () => {
        const i = list.lastIndexOf(close)
        if (i >= 0) list.splice(i, 1)
      }
    },
    locate(issue) {
      return pins.sample([issue], win, options.screen?.())[0]?.status ?? 'unavailable'
    },
    check: issue => checkIssue(issue, doc, registry, attrs, options.screen?.()),
    showSent(issues) {
      sent = [...issues]
      pins.forgetMissing([...store.get().drafts.issues, ...sent])
      sample()
    },
    async describeSelection() {
      const sel = store.get().inspect.selection
      const location = cleanLocation(win.location.href)
      if (sel.kind === 'none') return { status: 'none', location }
      const g = geo.get()
      if (sel.kind === 'region') return { status: 'live', location, kind: 'region', bounds: g.a }
      const els = sel.kind === 'dom' ? [sel.handle] : sel.handles
      const descriptors = els.map(el => describe(el, attrs))
      return {
        status: 'live',
        location,
        kind: sel.kind,
        targets: descriptors.map(chipOf),
        descriptors,
        bounds: g.a,
        ...(sel.kind === 'dom' ? { box: readout(sel.handle), source: await sourceOf(sel.handle, options.sources ?? []) } : { members: g.members }),
      }
    },
    objectUrl(blob, ttl) {
      const url = root.objectUrl(blob)
      root.timeout(() => win.URL.revokeObjectURL(url), ttl)
      return url
    },
    destroyed: () => destroyed,
    destroy() {
      if (destroyed) return
      destroyed = true
      picker.stop()
      hover.stop()
      keys.stop()
      root.dispose()
      candidate = null
      described = null
      pending = null
      draft = null
      layers.length = 0
      viewLayers.length = 0
      lastLayers.length = 0
    },
  }
  return engine
}

export type { Issue }

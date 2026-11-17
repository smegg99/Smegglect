// src/dom/engine/types.ts
// What the engine offers a UI: its options, its state, its geometry and its operations.

import type { KeptSelection } from './keep'
import type { Comparison } from '../../core/compare'
import type { Drafts, IntentPatch } from '../../core/drafts'
import type {
  BoundaryKind, ConstraintId, ContentsMode, ElementDescriptor, Issue, Rect, Scope, TargetKind,
} from '../../core/model'
import type { InspectState, Point } from '../../core/modes'
import type { PresetDef, PresetRegistry } from '../../core/presets'
import type { BoxModel, Readout } from '../boxmodel'
import type { BridgeClient, BridgeConfig } from '../bridge'
import type { IssueCheck, SelectionReport } from '../check'
import type { Pin } from '../pins'
import type { ContextProvider, SourceProvider } from '../providers'
import type { Session } from '../session'
import type { DraftStorage } from '../storage'
import type { HostWindow } from '../window'

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
  /** A region's elements: how they were chosen and how many there are. */
  contents?: { mode: ContentsMode, count: number }
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

/** A space picked while measuring: `padding-top`, `margin-left` or `gap`, and its size in px. */
interface PickedSpace {
  name: string
  size: number
}

export interface EngineState {
  inspect: InspectState<Element>
  /** The space the selection was picked by, cleared when the selection changes. */
  space: PickedSpace | null
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

/** The space under the pointer while measuring, drawn so it can be picked. */
export interface HoveredSpace extends PickedSpace {
  rect: Rect
}

/** The hovered element as drawn. `box`, `relation` and `space` are present only while measuring. */
export interface Hovered {
  rect: Rect
  chip: string
  boundary?: BoundaryKind
  box?: BoxModel
  /** Only with a selection. */
  relation?: HoverRelation
  space?: HoveredSpace
}

export interface Geometry {
  candidate: Hovered | null
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
  | 'needs-note'
  | 'not-applicable'
  | 'no-selection'
  | 'unknown-preset'

/** What the person adds to an issue when it is recorded. */
export interface CommitInput {
  note?: string
  scope?: Scope
  constraints?: ConstraintId[]
}

/** Where a UI layer closes in Escape's order: before anything, after a page-click mode, or last. */
export type LayerOrder = 'first' | 'view' | 'last'

export interface Engine {
  readonly registry: PresetRegistry
  readonly session: Session
  readonly bridge: BridgeClient | null
  state: () => EngineState
  subscribe: (fn: (s: EngineState) => void) => () => void
  geometry: () => Geometry
  subscribeGeometry: (fn: (g: Geometry) => void) => () => void
  setExpanded: (on: boolean) => void
  /**
   * Shortcuts and Escape in another window that shows the overlay, such as a pop-out;
   * everything there is Smegglect's.
   */
  listenKeys: (other: HostWindow) => () => void
  /** Alt+Shift shortcuts on or off; Escape keeps working. */
  setShortcuts: (on: boolean) => void
  togglePick: () => void
  toggleRegion: () => void
  setExtend: (on: boolean) => void
  regionStart: (p: Point) => void
  /** Live rectangle while dragging, viewport frame. */
  regionDraft: (rect: Rect) => void
  /**
   * Viewport rectangle; stored as a document-frame region so it scrolls with the page, with the elements it
   * holds by `mode`: fully inside, or touching it.
   */
  regionEnd: (rect: Rect, mode: ContentsMode) => void
  escape: () => boolean
  clear: () => void
  /** Takes the group member at this place out of the selection; one left becomes a plain selection. */
  drop: (index: number) => void
  escalate: () => void
  setMeasuring: (on: boolean) => void
  setAnnotations: (on: boolean) => void
  /** Starts a preset: asks for B or an anchor when needed, then opens the issue form. Records nothing. */
  begin: (preset: string, params?: Record<string, string>) => ApplyResult
  /**
   * Records the composed issue. Refuses an identical draft with `exists`, and gives `no-selection` when
   * the form was closed or replaced while its sources were looked up.
   */
  commit: (input?: CommitInput) => Promise<ApplyResult>
  cancelCompose: () => void
  /** begin and commit in one call, for scripts and headless use. */
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
  /**
   * Registers a UI layer (popover, issue view, report) that Escape closes;
   * `last` layers close after mode and selection.
   */
  pushLayer: (close: () => void, order?: LayerOrder) => () => void
  /** Object URL released after `ttl` ms or on destroy, whichever comes first. */
  objectUrl: (blob: Blob, ttl: number) => string
  /** The target's viewport rect on this page; null when it is not drawn here. */
  targetRect: (issue: Issue) => Rect | null
  /** Where an issue's target is now, without touching its captured evidence. */
  locate: (issue: Issue) => Pin['status']
  /** For an agent: the issue's target found again on this page and measured now. */
  check: (issue: Issue) => IssueCheck
  /** For an agent: what is selected now, with its size, box values and source when known. */
  describeSelection: () => Promise<SelectionReport>
  /** The selection as plain data, to be found again after the page reloads; null when nothing is selected. */
  keptSelection: () => KeptSelection | null
  /** Selects what was kept, found again on this page; false when it is not found here. */
  restoreSelection: (kept: KeptSelection) => boolean
  destroy: () => void
}

// src/core/model.ts
// Serialisable batch, issue and target records. No DOM, Vue or Node types.

export const BATCH_SCHEMA = 'smegglect.batch'
export const BATCH_VERSION = 1

/** CSS pixels, unrounded. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** viewport: relative to the layout viewport origin; document: viewport plus scroll offset. */
export type CoordinateFrame = 'viewport' | 'document'

export interface CaptureConditions {
  frame: CoordinateFrame
  units: 'css-px'
  viewport: { width: number, height: number }
  scroll: { x: number, y: number }
  devicePixelRatio: number
  /** visualViewport.scale when known (pinch zoom), 1 otherwise. */
  visualScale: number
  colorScheme: 'light' | 'dark' | 'unknown'
  /** Origin and path only; query and hash are stripped by redaction. */
  location: string
  screen?: string
  capturedAt: string
}

/** Safe, bounded description of one element. Never contains input values or raw HTML. */
export interface ElementDescriptor {
  tag: string
  role?: string
  /** Visible or accessible label, bounded and untrusted. */
  label?: string
  /** Element id when it does not look generated. */
  id?: string
  /** Value of an explicitly allowlisted test attribute. */
  testId?: string
  classes: string[]
  /** Ancestor chain, outermost first, each `tag` or `tag#id` or `tag[test=x]`. */
  path: string[]
  /** Position among siblings sharing the same signature inside the nearest repeating container. */
  occurrence?: { index: number, count: number, item?: string }
  /** Number of open shadow roots between the document and the element. */
  shadowDepth: number
}

export type BoundaryKind = 'canvas' | 'iframe' | 'closed-root' | 'native' | 'manual'

/** The element a region was drawn on and the region's top-left corner from that element's, in CSS px. */
export interface RegionAnchor {
  element: ElementDescriptor
  offset: { x: number, y: number }
}

export type TargetRef =
  | { kind: 'dom', element: ElementDescriptor }
  | { kind: 'group', members: ElementDescriptor[], anchor?: number }
  /** `anchor`: drawn where its element is now; without one, or with the element gone, at `rect`. */
  | { kind: 'region', rect: Rect, frame: CoordinateFrame, boundary: BoundaryKind, anchor?: RegionAnchor }

export type TargetKind = TargetRef['kind']

export type SourceQuality = 'exact' | 'component' | 'visual-only'

export interface SourceRef {
  quality: SourceQuality
  /** Which mechanism produced it, e.g. `vue-instance`, `vite-transform`, `none`. */
  provenance: string
  /** Project-relative path. */
  file?: string
  line?: number
  column?: number
  component?: string
  /** Owning user components, innermost first, excluding library internals when known. */
  owners?: string[]
}

export interface TargetEvidence {
  /** Rendered bounds in the capture frame; for groups the union. */
  bounds: Rect
  members?: Rect[]
  /** True when an ancestor or the element has a transform: bounds are rendered, not layout. */
  transformed: boolean
  /** Allowlisted computed properties. */
  properties: Record<string, string>
  /** Group targets: the compared properties of each member, in member order. */
  memberProperties?: Record<string, string>[]
  parent?: { element: ElementDescriptor, bounds: Rect }
  source: SourceRef
  /** Region targets: the elements the region holds, when it holds any. */
  contents?: RegionContents
}

/** Which elements a region lists: those fully inside it (dragged left to right) or those it touches. */
export type ContentsMode = 'inside' | 'touching'

/** One element a region holds, described as an element target would be. */
export interface ContentsElement {
  element: ElementDescriptor
  bounds: Rect
  source: SourceRef
}

/** The elements a region holds, in document order: the first `LIMITS.members` and how many there were. */
export interface RegionContents {
  mode: ContentsMode
  elements: ContentsElement[]
  total: number
}

export type AxisRelation =
  | { kind: 'gap', distance: number }
  | { kind: 'touch' }
  | { kind: 'overlap', distance: number }

/** Pairwise geometry from A (target) to B (reference). */
export interface Relation {
  horizontal: AxisRelation
  vertical: AxisRelation
  /** Separated on both axes: no single CSS gap applies. */
  diagonal: boolean
  overlap: Rect | null
  /** B minus A for each edge and centre. */
  delta: {
    left: number
    right: number
    top: number
    bottom: number
    centerX: number
    centerY: number
    width: number
    height: number
  }
}

export interface ContextEntry {
  provider: string
  fields: Record<string, string | number | boolean>
  /** Present when the provider did not answer; the fields are then empty. */
  status?: 'failed' | 'timeout'
}

export type Scope = 'occurrence' | 'screen' | 'component'

export const CONSTRAINTS = [
  'keep-responsive',
  'keep-tokens',
  'no-fixed-size',
  'keep-behaviour',
  'keep-other-instances',
  'keep-text',
] as const

export type ConstraintId = typeof CONSTRAINTS[number]

export interface Intent {
  preset: { id: string, version: number }
  /** Preset choices, e.g. `edge: left`, `outcome: smaller`. */
  params: Record<string, string>
  scope: Scope
  constraints: ConstraintId[]
  note: string
}

export interface Operands {
  /** A: the target to change. */
  a: TargetRef
  /** B: the reference A should follow. */
  b?: TargetRef
}

export interface Evidence {
  capture: CaptureConditions
  a: TargetEvidence
  b?: TargetEvidence
  relation?: Relation
  context: ContextEntry[]
}

export type IssueStatus = 'draft' | 'submitted'

export interface Issue {
  id: string
  /** Display order; pins use `id`, never this number. */
  seq: number
  status: IssueStatus
  createdAt: string
  updatedAt: string
  intent: Intent
  operands: Operands
  evidence: Evidence
  attachments: string[]
}

export type ReviewState = 'pending' | 'approved'

export interface Attachment {
  id: string
  issueId: string
  name: string
  mime: string
  size: number
  review: ReviewState
  createdAt: string
}

/** One line of the activity history. Text is rendered from these fields, never stored as prose. */
export interface HistoryEvent {
  id: string
  project: string
  at: string
  kind:
    | 'added'
    | 'edited'
    | 'removed'
    | 'undone'
    | 'redone'
    | 'submitted'
    | 'copied'
    | 'exported'
    | 'shared'
    | 'taken'
    | 'checked'
    | 'answered'
  issueId?: string
  batchId?: string
  seq?: number
  preset?: string
  params?: Record<string, string>
  /** Chip text of the target, bounded and untrusted. */
  target?: string
  location?: string
  /** edited: changed field names. */
  detail?: string
  count?: number
  /** answered: the state the agent gave; never its text. */
  state?: AgentState
  /** taken, checked, answered: which agent, as a word. */
  agent?: 'claude' | 'other'
}

/** What an agent may claim about an issue it was given. */
export const AGENT_STATES = ['in-progress', 'partial', 'blocked', 'needs-review'] as const

export type AgentState = typeof AGENT_STATES[number]

/** How a check the agent ran went, as it says. */
export const CHECK_OUTCOMES = ['passed', 'failed', 'not-run'] as const

export type CheckOutcome = typeof CHECK_OUTCOMES[number]

/**
 * Append-only record after submission; the submitted batch itself never changes. A person's note, or the
 * agent's result for one issue.
 */
export interface FollowUp {
  id: string
  batchId: string
  issueId: string
  kind: 'note' | 'result'
  actor: 'human' | 'agent'
  createdAt: string
  text: string
  /** result: the agent's claimed state. */
  state?: AgentState
  /** result: project-relative files the agent changed, as reported. */
  files?: string[]
  /** result: checks the agent reports having run; untrusted text. */
  checks?: { command: string, outcome: CheckOutcome }[]
}

export interface Batch {
  schema: typeof BATCH_SCHEMA
  version: typeof BATCH_VERSION
  id: string
  project: { id: string, name?: string }
  window: { id: string }
  status: 'draft' | 'submitted'
  createdAt: string
  submittedAt?: string
  issues: Issue[]
  attachments: Attachment[]
  /** Optional provider evidence, e.g. git branch. Unknown stays absent. */
  provider?: Record<string, string>
}

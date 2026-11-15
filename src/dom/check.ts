// src/dom/check.ts
// An agent's live check: the issue's target found again on this page and measured now.

import { compare, type Comparison } from '../core/compare'
import { px, shift } from '../core/geometry'
import type { CaptureConditions, ElementDescriptor, Issue, Rect, SourceRef, TargetEvidence } from '../core/model'
import type { PresetRegistry } from '../core/presets'
import { cleanLocation } from '../core/redact'
import type { Readout } from './boxmodel'
import { conditions, rectOf, rendered } from './capture'
import { elementsOf, measure, type Operand } from './issue'
import { elsewhere, type PinStatus } from './pins'
import { candidateCount, nearestAncestor, resolveAgain } from './resolve'
import { windowOf } from './window'

type Measured = Omit<TargetEvidence, 'source'>

export interface Change {
  property: string
  then: string
  now: string
}

/** What the answering page shows its content under. */
interface PageConditions {
  viewport: CaptureConditions['viewport']
  devicePixelRatio: number
  colorScheme: CaptureConditions['colorScheme']
}

/** Why a target is not on the page: what could have been it, and the nearest old ancestor still there. */
export interface Missing {
  /** Elements with the target's tag, id or test id, before its place and text were compared. */
  candidates: number
  ancestor: { step: string, levelsUp: number, bounds: Rect } | null
}

export interface IssueCheck {
  status: PinStatus | 'unknown'
  location: string
  conditions: PageConditions
  /** The viewport, pixel ratio and colour scheme are the ones the issue was reported under. */
  sameConditions: boolean
  /** For an `unavailable` target. */
  missing?: Missing
  /**
   * Found by its place and attributes only: its text no longer matches the report,
   * often because of the fix.
   */
  found?: 'without-label'
  /** Where the issue was reported, when that is another page or screen. */
  reportedAt?: string
  now?: { a: Measured, b?: Measured }
  /** What differs from the report: rendered size, then each captured property. */
  changes?: Change[]
  /** The preset's A/B comparison, measured now. */
  comparison?: Comparison | null
}

/** What the person has selected, for an agent that was told "this". */
export interface SelectionReport {
  status: 'live' | 'none'
  location: string
  conditions: PageConditions
  kind?: 'dom' | 'group' | 'region'
  targets?: string[]
  descriptors?: ElementDescriptor[]
  bounds?: Rect | null
  members?: Rect[]
  box?: Readout | null
  source?: SourceRef
}

export function pageConditions(doc: Document): PageConditions {
  const { viewport, devicePixelRatio, colorScheme } = conditions(doc)
  return { viewport, devicePixelRatio, colorScheme }
}

function sameConditions(now: PageConditions, then: CaptureConditions): boolean {
  return now.viewport.width === then.viewport.width
    && now.viewport.height === then.viewport.height
    && now.devicePixelRatio === then.devicePixelRatio
    && now.colorScheme === then.colorScheme
}

function missingOf(doc: Document, want: ElementDescriptor, attrs: readonly string[]): Missing {
  const ancestor = nearestAncestor(doc, want, attrs)
  return {
    candidates: candidateCount(doc, want, attrs),
    ancestor: ancestor && {
      step: ancestor.step,
      levelsUp: ancestor.levelsUp,
      bounds: rectOf(ancestor.element),
    },
  }
}

/** Where the issue's target is on this page: a live operand, or why there is none. */
interface Located {
  status: PinStatus
  op?: Operand
  /** Found without its label: only its place and attributes still match. */
  loose?: boolean
  missing?: Missing
}

/** One descriptor found again on the page. */
interface Hit {
  element: Element
  loose: boolean
}

function findOne(doc: Document, descriptor: ElementDescriptor, attrs: readonly string[]): Hit | Located {
  const resolved = resolveAgain(doc, descriptor, attrs)
  if (resolved.status === 'unavailable') {
    return { status: resolved.status, missing: missingOf(doc, descriptor, attrs) }
  }
  if (resolved.status !== 'resolved') return { status: resolved.status }
  return { element: resolved.element, loose: !!resolved.withoutLabel }
}

function target(issue: Issue, doc: Document, attrs: readonly string[]): Located {
  const a = issue.operands.a
  if (a.kind === 'region') {
    const win = windowOf(doc)
    const cap = issue.evidence.capture
    const rect = a.frame === 'document'
      ? a.rect
      : shift(a.rect, cap.scroll.x - win.scrollX, cap.scroll.y - win.scrollY)
    return { status: 'live', op: { kind: 'region', rect, frame: a.frame } }
  }
  if (a.kind === 'dom') {
    const hit = findOne(doc, a.element, attrs)
    if (!('element' in hit)) return hit
    return { status: 'live', op: { kind: 'dom', element: hit.element }, loose: hit.loose }
  }
  const elements: Element[] = []
  let loose = false
  for (const descriptor of a.members) {
    const hit = findOne(doc, descriptor, attrs)
    if (!('element' in hit)) return hit
    elements.push(hit.element)
    loose ||= hit.loose
  }
  return {
    status: 'live',
    op: { kind: 'group', elements, ...(a.anchor !== undefined ? { anchor: a.anchor } : {}) },
    loose,
  }
}

function changes(then: TargetEvidence, now: Measured): Change[] {
  const out: Change[] = []
  for (const dimension of ['width', 'height'] as const) {
    if (px(then.bounds[dimension]) !== px(now.bounds[dimension])) out.push({
      property: `bounds.${dimension}`,
      then: px(then.bounds[dimension]),
      now: px(now.bounds[dimension]),
    })
  }
  for (const property of new Set([...Object.keys(then.properties), ...Object.keys(now.properties)])) {
    const was = then.properties[property] ?? ''
    const is = now.properties[property] ?? ''
    if (was !== is) out.push({ property, then: was, now: is })
  }
  return out
}

export function checkIssue(
  issue: Issue,
  doc: Document,
  registry: PresetRegistry,
  attrs: readonly string[],
  screen?: string,
): IssueCheck {
  const location = cleanLocation(windowOf(doc).location.href)
  const page = pageConditions(doc)
  const said = { location, conditions: page, sameConditions: sameConditions(page, issue.evidence.capture) }
  if (elsewhere(issue, location, screen)) {
    return { status: 'elsewhere', ...said, reportedAt: issue.evidence.capture.location }
  }
  const found = target(issue, doc, attrs)
  if (!found.op) return { status: found.status, ...said, missing: found.missing }
  // Without a box nothing can be measured: the view it is in is hidden now.
  if (!elementsOf(found.op).every(rendered)) return { status: 'hidden', ...said }
  const def = registry.byId.get(issue.intent.preset.id)
  if (!def) return { status: 'unknown', ...said }
  const a = measure(found.op, def, doc, attrs)
  const bRef = issue.operands.b
  const bHit = bRef?.kind === 'dom' ? resolveAgain(doc, bRef.element, attrs) : null
  const b = bHit?.status === 'resolved'
    ? measure({ kind: 'dom', element: bHit.element }, def, doc, attrs)
    : undefined
  const source = issue.evidence.a.source
  return {
    status: 'live',
    ...said,
    found: found.loose ? 'without-label' : undefined,
    now: { a, b },
    changes: changes(issue.evidence.a, a),
    comparison: compare(
      def,
      issue.intent.params,
      { ...a, source },
      b ? { ...b, source: issue.evidence.b?.source ?? source } : undefined,
    ),
  }
}

// src/dom/check.ts
// An agent's live check: the issue's target found again on this page and measured now.

import { compare, type Comparison } from '../core/compare'
import { px, shift } from '../core/geometry'
import type { ElementDescriptor, Issue, Rect, SourceRef, TargetEvidence } from '../core/model'
import type { PresetRegistry } from '../core/presets'
import { cleanLocation } from '../core/redact'
import type { Readout } from './boxmodel'
import { measure, type Operand } from './issue'
import { elsewhere, type PinStatus } from './pins'
import { resolveAgain } from './resolve'

type Measured = Omit<TargetEvidence, 'source'>

export interface Change {
  property: string
  then: string
  now: string
}

export interface IssueCheck {
  status: PinStatus | 'unknown'
  location: string
  /** Found by its place and attributes only: its text no longer matches the report, often because of the fix. */
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
  kind?: 'dom' | 'group' | 'region'
  targets?: string[]
  descriptors?: ElementDescriptor[]
  bounds?: Rect | null
  members?: Rect[]
  box?: Readout | null
  source?: SourceRef
}

function target(issue: Issue, doc: Document, attrs: readonly string[]): { status: PinStatus, op?: Operand, loose?: boolean } {
  const a = issue.operands.a
  if (a.kind === 'region') {
    const win = doc.defaultView!
    const cap = issue.evidence.capture
    const rect = a.frame === 'document' ? a.rect : shift(a.rect, cap.scroll.x - win.scrollX, cap.scroll.y - win.scrollY)
    return { status: 'live', op: { kind: 'region', rect, frame: a.frame } }
  }
  const elements: Element[] = []
  let loose = false
  for (const d of a.kind === 'dom' ? [a.element] : a.members) {
    const r = resolveAgain(doc, d, attrs)
    if (r.status !== 'resolved') return { status: r.status }
    elements.push(r.element)
    loose ||= !!r.withoutLabel
  }
  const more = loose ? { loose } : {}
  if (a.kind === 'dom') return { status: 'live', op: { kind: 'dom', element: elements[0]! }, ...more }
  return { status: 'live', op: { kind: 'group', elements, ...(a.anchor !== undefined ? { anchor: a.anchor } : {}) }, ...more }
}

function changes(then: TargetEvidence, now: Measured): Change[] {
  const out: Change[] = []
  for (const k of ['width', 'height'] as const) {
    if (px(then.bounds[k]) !== px(now.bounds[k])) out.push({ property: `bounds.${k}`, then: px(then.bounds[k]), now: px(now.bounds[k]) })
  }
  for (const k of new Set([...Object.keys(then.properties), ...Object.keys(now.properties)])) {
    const was = then.properties[k] ?? ''
    const is = now.properties[k] ?? ''
    if (was !== is) out.push({ property: k, then: was, now: is })
  }
  return out
}

export function checkIssue(issue: Issue, doc: Document, registry: PresetRegistry, attrs: readonly string[], screen?: string): IssueCheck {
  const location = cleanLocation(doc.defaultView!.location.href)
  if (elsewhere(issue, location, screen)) return { status: 'elsewhere', location, reportedAt: issue.evidence.capture.location }
  const found = target(issue, doc, attrs)
  if (!found.op) return { status: found.status, location }
  const def = registry.byId.get(issue.intent.preset.id)
  if (!def) return { status: 'unknown', location }
  const a = measure(found.op, def, doc, attrs)
  const bRef = issue.operands.b
  const bHit = bRef?.kind === 'dom' ? resolveAgain(doc, bRef.element, attrs) : null
  const b = bHit?.status === 'resolved' ? measure({ kind: 'dom', element: bHit.element }, def, doc, attrs) : undefined
  const source = issue.evidence.a.source
  return {
    status: 'live',
    location,
    ...(found.loose ? { found: 'without-label' as const } : {}),
    now: { a, ...(b ? { b } : {}) },
    changes: changes(issue.evidence.a, a),
    comparison: compare(def, issue.intent.params, { ...a, source }, b ? { ...b, source: issue.evidence.b?.source ?? source } : undefined),
  }
}

// src/dom/issue.ts
// Live operands -> one draft issue: authored intent kept apart from captured evidence.

import { relate, shift, union } from '../core/geometry'
import { createId } from '../core/ids'
import type { ConstraintId, Issue, Rect, Scope, TargetEvidence, TargetRef } from '../core/model'
import type { PresetDef } from '../core/presets'
import { LIMITS } from '../core/validate'
import { conditions, evidenceOf, transformed } from './capture'
import { describe } from './describe'
import { contextOf, sourceOf, VISUAL_ONLY, type ContextProvider, type SourceProvider } from './providers'

export type Operand =
  | { kind: 'dom', element: Element }
  | { kind: 'group', elements: Element[], anchor?: number }
  | { kind: 'region', rect: Rect, frame: 'viewport' | 'document' }

export interface IssueInput {
  doc: Document
  def: PresetDef
  params: Record<string, string>
  note: string
  scope?: Scope
  constraints?: ConstraintId[]
  a: Operand
  b?: Operand
  attrs: readonly string[]
  sources: readonly SourceProvider[]
  context: readonly ContextProvider[]
  screen?: string
}

export function refOf(op: Operand, attrs: readonly string[]): TargetRef {
  if (op.kind === 'dom') return { kind: 'dom', element: describe(op.element, attrs) }
  if (op.kind === 'group') {
    const members = op.elements.map(el => describe(el, attrs))
    return op.anchor === undefined ? { kind: 'group', members } : { kind: 'group', members, anchor: op.anchor }
  }
  return { kind: 'region', rect: op.rect, frame: op.frame, boundary: 'manual' }
}

/** Captured geometry and properties without source lookup; also what the issue form previews. */
export function measure(op: Operand, def: PresetDef, doc: Document, attrs: readonly string[]): Omit<TargetEvidence, 'source'> {
  const needs = def.evidence
  const extra = def.compare ?? []
  if (op.kind === 'dom') return evidenceOf(op.element, needs, attrs, extra)
  if (op.kind === 'group') {
    const main = op.elements[op.anchor ?? 0] as Element
    const base = evidenceOf(main, needs.filter(n => n !== 'parent'), attrs, extra)
    const each = op.elements.map(el => evidenceOf(el, [], attrs, extra))
    const members = each.map(e => e.bounds)
    return {
      bounds: union(members),
      members,
      transformed: op.elements.some(transformed),
      properties: base.properties,
      ...(extra.length ? { memberProperties: each.map(e => e.properties) } : {}),
    }
  }
  const win = doc.defaultView!
  const bounds = op.frame === 'document' ? shift(op.rect, -win.scrollX, -win.scrollY) : op.rect
  return { bounds, transformed: false, properties: {} }
}

async function evidence(op: Operand, input: IssueInput): Promise<TargetEvidence> {
  const base = measure(op, input.def, input.doc, input.attrs)
  if (op.kind === 'dom') return { ...base, source: await sourceOf(op.element, input.sources) }
  if (op.kind === 'group') return { ...base, source: await sourceOf(op.elements[op.anchor ?? 0] as Element, input.sources) }
  return { ...base, source: VISUAL_ONLY }
}

export async function createIssue(input: IssueInput): Promise<Omit<Issue, 'seq'>> {
  const capture = conditions(input.doc, input.screen)
  const [a, b, context] = await Promise.all([
    evidence(input.a, input),
    input.b ? evidence(input.b, input) : Promise.resolve(undefined),
    contextOf(input.context),
  ])
  const now = capture.capturedAt
  const issue: Omit<Issue, 'seq'> = {
    id: createId('iss'),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    intent: {
      preset: { id: input.def.id, version: input.def.version },
      params: { ...input.params },
      scope: input.scope ?? 'occurrence',
      constraints: input.constraints ?? [],
      note: input.note.slice(0, LIMITS.note),
    },
    operands: input.b ? { a: refOf(input.a, input.attrs), b: refOf(input.b, input.attrs) } : { a: refOf(input.a, input.attrs) },
    evidence: b ? { capture, a, b, relation: relate(a.bounds, b.bounds), context } : { capture, a, context },
    attachments: [],
  }
  return issue
}

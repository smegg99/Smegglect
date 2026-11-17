// src/dom/issue.ts
// Live operands -> one draft issue: authored intent kept apart from captured evidence.

import { relate, union } from '../core/geometry'
import { createId } from '../core/ids'
import type { ConstraintId, Issue, Scope, TargetEvidence, TargetRef } from '../core/model'
import type { PresetDef } from '../core/presets'
import { LIMITS } from '../core/limits'
import { conditions, evidenceOf, transformed } from './capture'
import { describe } from './describe'
import { contextOf, sourceOf, type ContextProvider, type SourceProvider } from './providers'

export type Operand =
  | { kind: 'dom', element: Element }
  | { kind: 'group', elements: Element[], anchor?: number }

interface IssueInput {
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

/** The elements an operand stands on. */
export function elementsOf(op: Operand): Element[] {
  return op.kind === 'dom' ? [op.element] : op.elements
}

export function refOf(op: Operand, attrs: readonly string[]): TargetRef {
  if (op.kind === 'dom') return { kind: 'dom', element: describe(op.element, attrs) }
  const members = op.elements.map(element => describe(element, attrs))
  return op.anchor === undefined
    ? { kind: 'group', members }
    : { kind: 'group', members, anchor: op.anchor }
}

/** Captured geometry and properties without source lookup; also what the issue form previews. */
export function measure(
  op: Operand,
  def: PresetDef,
  attrs: readonly string[],
): Omit<TargetEvidence, 'source'> {
  const needs = def.evidence
  const extra = def.compare ?? []
  if (op.kind === 'dom') return evidenceOf(op.element, needs, attrs, extra)
  const main = op.elements[op.anchor ?? 0] as Element
  const base = evidenceOf(main, needs.filter(need => need !== 'parent'), attrs, extra)
  const each = op.elements.map(element => evidenceOf(element, [], attrs, extra))
  const members = each.map(member => member.bounds)
  return {
    bounds: union(members),
    members,
    transformed: op.elements.some(transformed),
    properties: base.properties,
    ...(extra.length ? { memberProperties: each.map(member => member.properties) } : {}),
  }
}

/** A group gives each member's source as well, so the agent can start from every file it touches. */
async function evidence(op: Operand, input: IssueInput): Promise<TargetEvidence> {
  const base = measure(op, input.def, input.attrs)
  if (op.kind === 'dom') return { ...base, source: await sourceOf(op.element, input.sources) }
  const sources = await Promise.all(op.elements.map(element => sourceOf(element, input.sources)))
  return { ...base, source: sources[op.anchor ?? 0] as TargetEvidence['source'], memberSources: sources }
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
    operands: input.b
      ? { a: refOf(input.a, input.attrs), b: refOf(input.b, input.attrs) }
      : { a: refOf(input.a, input.attrs) },
    evidence: b ? { capture, a, b, relation: relate(a.bounds, b.bounds), context } : { capture, a, context },
    attachments: [],
  }
  return issue
}

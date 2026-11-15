// src/dom/issue.ts
// Live operands -> one draft issue: authored intent kept apart from captured evidence.

import { relate, shift, union } from '../core/geometry'
import { createId } from '../core/ids'
import type { ConstraintId, Issue, Rect, RegionContents, Scope, TargetEvidence, TargetRef } from '../core/model'
import type { Held } from '../core/modes'
import type { PresetDef } from '../core/presets'
import { LIMITS } from '../core/limits'
import { conditions, evidenceOf, rectOf, transformed } from './capture'
import { describe } from './describe'
import { contextOf, sourceOf, VISUAL_ONLY, type ContextProvider, type SourceProvider } from './providers'
import { windowOf } from './window'

export type Operand =
  | { kind: 'dom', element: Element }
  | { kind: 'group', elements: Element[], anchor?: number }
  | { kind: 'region', rect: Rect, frame: 'viewport' | 'document', contents?: Held<Element> }

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

/** The elements an operand stands on; a region has none. */
export function elementsOf(op: Operand): Element[] {
  if (op.kind === 'dom') return [op.element]
  if (op.kind === 'group') return op.elements
  return []
}

export function refOf(op: Operand, attrs: readonly string[]): TargetRef {
  if (op.kind === 'dom') return { kind: 'dom', element: describe(op.element, attrs) }
  if (op.kind === 'group') {
    const members = op.elements.map(element => describe(element, attrs))
    return op.anchor === undefined
      ? { kind: 'group', members }
      : { kind: 'group', members, anchor: op.anchor }
  }
  return { kind: 'region', rect: op.rect, frame: op.frame, boundary: 'manual' }
}

/** Captured geometry and properties without source lookup; also what the issue form previews. */
export function measure(
  op: Operand,
  def: PresetDef,
  doc: Document,
  attrs: readonly string[],
): Omit<TargetEvidence, 'source'> {
  const needs = def.evidence
  const extra = def.compare ?? []
  if (op.kind === 'dom') return evidenceOf(op.element, needs, attrs, extra)
  if (op.kind === 'group') {
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
  const win = windowOf(doc)
  const bounds = op.frame === 'document' ? shift(op.rect, -win.scrollX, -win.scrollY) : op.rect
  return { bounds, transformed: false, properties: {} }
}

/** A region's elements as the agent gets them; those gone from the page since the drag are left out. */
/** How many elements a region holds now: those it found, less the ones that have left the page. */
export function heldTotal(held: Held<Element>): number {
  return held.total - held.handles.filter(element => !element.isConnected).length
}

async function contentsOf(held: Held<Element>, input: IssueInput): Promise<RegionContents | undefined> {
  const live = held.handles.filter(element => element.isConnected)
  if (!live.length) return undefined
  const elements = await Promise.all(live.map(async element => ({
    element: describe(element, input.attrs),
    bounds: rectOf(element),
    source: await sourceOf(element, input.sources),
  })))
  return { mode: held.mode, elements, total: heldTotal(held) }
}

async function evidence(op: Operand, input: IssueInput): Promise<TargetEvidence> {
  const base = measure(op, input.def, input.doc, input.attrs)
  if (op.kind === 'dom') return { ...base, source: await sourceOf(op.element, input.sources) }
  if (op.kind === 'group') return {
    ...base,
    source: await sourceOf(op.elements[op.anchor ?? 0] as Element, input.sources),
  }
  const contents = op.contents ? await contentsOf(op.contents, input) : undefined
  return contents ? { ...base, source: VISUAL_ONLY, contents } : { ...base, source: VISUAL_ONLY }
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

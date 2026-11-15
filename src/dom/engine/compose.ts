// src/dom/engine/compose.ts
// Composing an issue: a preset begun on the selection, its reference or anchor clicked on the page, the form
// the person sees, and the issue recorded from it.

import { compare } from '../../core/compare'
import { addIssue, findSame } from '../../core/drafts'
import type { Issue } from '../../core/model'
import type { PresetDef } from '../../core/presets'
import { chipOf, describe, pickable } from '../describe'
import { createIssue, measure, refOf, type Operand } from '../issue'
import { VISUAL_ONLY } from '../providers'
import { spaceAt, spaceName, type SpaceHit } from '../spaces'
import { notify, patch, selectedElements, type Draft, type EngineContext } from './context'
import { sample } from './geometry'
import { dispatch, operandA } from './inspect'
import { targetChip } from './issues'
import type { ApplyResult, CommitInput, Composing, Engine } from './types'

type GroupOperand = Extract<Operand, { kind: 'group' }>

/** A preset and its choice, waiting for B or an anchor on the selection A. */
interface Choice {
  def: PresetDef
  params: Record<string, string>
  a: Operand
}

/** How the form names an operand: an element by its label, a group by its size, a region not at all. */
function operandChip(context: EngineContext, operand: Operand): string {
  if (operand.kind === 'dom') return chipOf(describe(operand.element, context.attributes))
  if (operand.kind === 'group') return `${operand.elements.length}`
  return ''
}

/** A draft that already reports this preset and choice on the same A and B. */
function sameDraft(context: EngineContext, draft: Draft, params: Record<string, string>): Issue | undefined {
  const { attributes } = context
  const operands = draft.b
    ? { a: refOf(draft.a, attributes), b: refOf(draft.b, attributes) }
    : { a: refOf(draft.a, attributes) }
  const preset = { id: draft.def.id, version: draft.def.version }
  const intent = { preset, params, scope: 'occurrence' as const, constraints: [], note: '' }
  return findSame(context.store.get().drafts, { intent, operands })
}

function composeView(context: EngineContext, draft: Draft, params: Record<string, string>): Composing {
  const { doc, attributes } = context
  const evidenceA = measure(draft.a, draft.def, doc, attributes)
  const evidenceB = draft.b ? measure(draft.b, draft.def, doc, attributes) : undefined
  // The form measures before any source lookup; the recorded issue looks its source up.
  const sourcedB = evidenceB ? { ...evidenceB, source: VISUAL_ONLY } : undefined
  return {
    preset: draft.def.id,
    params,
    a: { kind: draft.a.kind, chip: operandChip(context, draft.a) },
    b: draft.b ? { chip: operandChip(context, draft.b) } : undefined,
    bBounds: evidenceB?.bounds,
    comparison: compare(draft.def, params, { ...evidenceA, source: VISUAL_ONLY }, sourcedB),
    existing: sameDraft(context, draft, params)?.id ?? null,
  }
}

function startCompose(context: EngineContext, choice: Choice, b?: Operand): void {
  const draft: Draft = { def: choice.def, a: choice.a, b }
  context.live.draft = draft
  patch(context, { composing: composeView(context, draft, choice.params) })
}

async function record(
  context: EngineContext,
  draft: Draft,
  params: Record<string, string>,
  input: CommitInput,
): Promise<ApplyResult> {
  const { options, live, session } = context
  const issue = await createIssue({
    doc: context.doc,
    def: draft.def,
    params,
    note: input.note?.trim() ?? '',
    a: draft.a,
    b: draft.b,
    attrs: context.attributes,
    scope: input.scope,
    constraints: input.constraints,
    sources: options.sources ?? [],
    context: options.context ?? [],
    screen: options.screen?.(),
  })
  // Escape, a new compose or destroy while the providers answered: this draft is no longer the person's.
  if (live.draft !== draft) return 'no-selection'
  const step = addIssue(context.store.get().drafts, issue)
  const added = step.drafts.issues.at(-1)
  if (step.outcome === 'exists' || !added) return 'exists'
  patch(context, { drafts: step.drafts, composing: null })
  live.draft = null
  context.pins.remember(added.id, draft.a, draft.b)
  session.changed()
  const { id: issueId, seq, intent } = added
  const { preset, params: chosen } = intent
  const location = added.evidence.capture.location
  const target = targetChip(added)
  session.log({ kind: 'added', issueId, seq, preset: preset.id, params: chosen, target, location })
  notify(context, { kind: 'added', issueId, seq })
  context.tracker.sync()
  sample(context)
  return 'added'
}

/** A reference preset needs B; a comparison needs it unless A is a group to compare within. */
function needsReference(def: PresetDef, a: Operand): boolean {
  return def.operands === 'reference' || (def.operands === 'compare' && a.kind !== 'group')
}

function begin(context: EngineContext, id: string, params: Record<string, string>): ApplyResult {
  const def = context.registry.byId.get(id)
  if (!def) return 'unknown-preset'
  const a = operandA(context)
  if (!a) return 'no-selection'
  if (!def.applies.includes(a.kind)) return 'not-applicable'
  if (needsReference(def, a)) {
    context.live.pending = { preset: id, params }
    dispatch(context, { type: 'need-reference', preset: id, params })
    return 'needs-reference'
  }
  if (def.id === 'group-align' && a.kind === 'group' && a.anchor === undefined) {
    context.live.pending = { preset: id, params }
    dispatch(context, { type: 'need-anchor', preset: id, params })
    return 'needs-anchor'
  }
  startCompose(context, { def, params, a })
  return 'composing'
}

function chooseReference(context: EngineContext, choice: Choice, element: Element): void {
  const members = selectedElements(context)
  if (members.includes(element)) {
    notify(context, { kind: 'reference-invalid', reason: members.length > 1 ? 'member' : 'same' })
    return
  }
  context.live.pending = null
  dispatch(context, { type: 'chosen' })
  startCompose(context, choice, { kind: 'dom', element })
}

function chooseAnchor(context: EngineContext, choice: Choice, group: GroupOperand, element: Element): void {
  const index = group.elements.findIndex(member => member === element || member.contains(element))
  if (index < 0) {
    notify(context, { kind: 'reference-invalid', reason: 'outside-group' })
    return
  }
  context.live.pending = null
  dispatch(context, { type: 'chosen' })
  // The anchor belongs to this issue only; the selection itself stays an unanchored group.
  startCompose(context, { ...choice, a: { ...group, anchor: index } })
}

/** A space picked while measuring selects what holds it: the element, or the two either side of a gap. */
function pickSpace(context: EngineContext, space: SpaceHit): void {
  const [first] = space.elements
  if (space.elements.length > 1) dispatch(context, { type: 'select-group', handles: space.elements })
  else if (first) dispatch(context, { type: 'select', handle: first })
  patch(context, { space: { name: spaceName(space), size: space.size } })
}

/** A click on the page: a pick, or the reference or anchor a preset waits for. */
export async function onPick(context: EngineContext, raw: Element, event: PointerEvent): Promise<void> {
  const element = pickable(raw)
  const state = context.store.get()
  const mode = state.inspect.mode
  if (mode.kind === 'pick') {
    // Shift, Ctrl or Cmd adds the element to the selection, or takes it out, as a file manager does.
    const adding = event.shiftKey || event.ctrlKey || event.metaKey || state.extend
    // While measuring the spaces are drawn, and a click on one picks that space.
    const space = !adding && state.measuring ? spaceAt(element, event.clientX, event.clientY) : null
    if (space) return pickSpace(context, space)
    dispatch(context, { type: 'select', handle: element, extend: adding })
    return
  }
  const pending = context.live.pending
  const def = pending ? context.registry.byId.get(pending.preset) : undefined
  const a = operandA(context)
  if (!pending || !def || !a) return
  const choice = { def, params: pending.params, a }
  if (mode.kind === 'reference') chooseReference(context, choice, element)
  if (mode.kind === 'anchor' && a.kind === 'group') chooseAnchor(context, choice, a, element)
}

async function commit(context: EngineContext, input: CommitInput): Promise<ApplyResult> {
  const draft = context.live.draft
  const composing = context.store.get().composing
  if (!draft || !composing) return 'no-selection'
  if (draft.def.note === 'required' && !input.note?.trim()) return 'needs-note'
  return record(context, draft, composing.params, input)
}

export function cancelCompose(context: EngineContext): void {
  context.live.draft = null
  if (context.store.get().composing) patch(context, { composing: null })
}

type ComposeApi = Pick<Engine, 'begin' | 'commit' | 'cancelCompose' | 'apply'>

export function composeApi(context: EngineContext): ComposeApi {
  return {
    begin: (id, params = {}) => begin(context, id, params),
    commit: (input = {}) => commit(context, input),
    cancelCompose: () => cancelCompose(context),
    async apply(id, params = {}, note = '') {
      const started = begin(context, id, params)
      if (started !== 'composing') return started
      return commit(context, { note })
    },
  }
}

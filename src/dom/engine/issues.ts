// src/dom/engine/issues.ts
// The draft issues: edit, remove, undo and redo with their history lines, and where each target is now.

import {
  editIssue, redoLast, removeIssue, undoLast, type Drafts, type IntentPatch, type Step,
} from '../../core/drafts'
import type { Issue, TargetRef } from '../../core/model'
import { checkIssue } from '../check'
import { chipOf } from '../describe'
import { refOf } from '../issue'
import { notify, patch, type EngineContext } from './context'
import { sample } from './geometry'
import { operandA } from './inspect'
import type { Engine } from './types'

/** The history's name for an issue's target: its label, its members' labels, or "region". */
export function targetChip(issue: Issue): string {
  const a = issue.operands.a
  if (a.kind === 'dom') return chipOf(a.element)
  if (a.kind === 'group') return a.members.map(chipOf).join(', ').slice(0, 120)
  return 'region'
}

/** Issues whose A is this target. Refs are plain data built in one key order, so equal ones print alike. */
function onTarget(issues: readonly Issue[], target: TargetRef): Issue[] {
  const wanted = JSON.stringify(target)
  return issues.filter(issue => JSON.stringify(issue.operands.a) === wanted)
}

function edit(context: EngineContext, id: string, change: IntentPatch): void {
  const { store, session } = context
  const step = editIssue(store.get().drafts, id, change, Date.now())
  if (step.outcome !== 'updated') return
  patch(context, { drafts: step.drafts })
  session.changed()
  const issue = step.drafts.issues.find(candidate => candidate.id === id)
  if (!issue) return
  const detail = Object.keys(change).join(',')
  session.log({ kind: 'edited', issueId: id, seq: issue.seq, preset: issue.intent.preset.id, detail })
}

function remove(context: EngineContext, id: string): void {
  const { store, session } = context
  const gone = store.get().drafts.issues.find(candidate => candidate.id === id)
  const step = removeIssue(store.get().drafts, id)
  if (step.outcome !== 'removed') return
  patch(context, { drafts: step.drafts })
  session.changed()
  if (gone) {
    const { seq, intent } = gone
    const { preset, params } = intent
    session.log({ kind: 'removed', issueId: id, seq, preset: preset.id, params, target: targetChip(gone) })
  }
  notify(context, { kind: 'removed', issueId: id })
  context.tracker.sync()
  sample(context)
}

/** Undo and redo: each step, and the outcome it reports when it did something. */
const HISTORY_STEPS: Record<'undone' | 'redone', (drafts: Drafts) => Step> = {
  undone: undoLast,
  redone: redoLast,
}

function historyStep(context: EngineContext, kind: 'undone' | 'redone'): void {
  const step = HISTORY_STEPS[kind](context.store.get().drafts)
  if (step.outcome !== kind) return
  patch(context, { drafts: step.drafts })
  context.session.changed()
  context.session.log({ kind })
  notify(context, { kind })
  context.tracker.sync()
  sample(context)
}

export const undo = (context: EngineContext) => historyStep(context, 'undone')
export const redo = (context: EngineContext) => historyStep(context, 'redone')

export function replaceDrafts(context: EngineContext, drafts: Drafts): void {
  patch(context, { drafts })
  context.pins.forgetMissing(drafts.issues)
  context.tracker.sync()
  sample(context)
}

function reveal(context: EngineContext, issueId: string): boolean {
  const { win, doc, options } = context
  // A sent issue too: a toast about the agent's result reveals it.
  const issue = context.store.get().drafts.issues.find(candidate => candidate.id === issueId)
    ?? context.session.store.get().submitted.flatMap(batch => batch.issues).find(sent => sent.id === issueId)
  if (!issue) return false
  const rect = context.pins.sample([issue], win, options.screen?.())[0]?.rect
  if (!rect) return false
  const viewportHeight = doc.documentElement.clientHeight
  const outside = rect.y < 0 || rect.y + rect.height > viewportHeight
  if (outside) win.scrollBy({ top: rect.y - viewportHeight / 3, behavior: 'smooth' })
  return true
}

type IssuesApi = Pick<Engine,
  | 'issuesOnSelection' | 'reveal' | 'locate' | 'targetRect' | 'check'
  | 'editIssue' | 'removeIssue' | 'undo' | 'redo' | 'replaceDrafts'
>

export function issuesApi(context: EngineContext): IssuesApi {
  const { win, doc, options, registry, attributes } = context
  return {
    issuesOnSelection() {
      const a = operandA(context)
      return a ? onTarget(context.store.get().drafts.issues, refOf(a, attributes)) : []
    },
    reveal: issueId => reveal(context, issueId),
    editIssue: (id, change) => edit(context, id, change),
    removeIssue: id => remove(context, id),
    undo: () => undo(context),
    redo: () => redo(context),
    replaceDrafts: drafts => replaceDrafts(context, drafts),
    locate: issue => context.pins.sample([issue], win, options.screen?.())[0]?.status ?? 'unavailable',
    targetRect: (issue) => {
      const pin = context.pins.sample([issue], win, options.screen?.())[0]
      return pin?.status === 'live' ? pin.rect : null
    },
    check: issue => checkIssue(issue, doc, registry, attributes, options.screen?.()),
  }
}

// src/core/drafts.ts
// The single in-memory issue queue with undo. Persistence wraps it; it does not replace it.

import type { Intent, Issue } from './model'

const UNDO_DEPTH = 30

/** One reversible change: undo applies it backwards, redo forwards. */
type Change =
  | { kind: 'added', issue: Issue, index: number }
  | { kind: 'removed', issue: Issue, index: number }
  | { kind: 'edited', id: string, before: Pick<Issue, 'intent' | 'updatedAt'>, after: Pick<Issue, 'intent' | 'updatedAt'> }

export interface Drafts {
  issues: Issue[]
  nextSeq: number
  undo: Change[]
  redo: Change[]
}

export type Outcome = 'added' | 'exists' | 'updated' | 'removed' | 'undone' | 'redone' | 'missing' | 'frozen' | 'empty'

export interface Step {
  drafts: Drafts
  outcome: Outcome
}

export type IntentPatch = Partial<Pick<Intent, 'note' | 'scope' | 'constraints' | 'params'>>

export function emptyDrafts(): Drafts {
  return { issues: [], nextSeq: 1, undo: [], redo: [] }
}

/** A new change starts a new future: the redo stack is dropped. */
function record(d: Drafts, issues: Issue[], change: Change, nextSeq = d.nextSeq): Drafts {
  return { issues, nextSeq, undo: [...d.undo, change].slice(-UNDO_DEPTH), redo: [] }
}

/** The same preset and choice on the same targets: one issue, however often it is reported. */
export function sameIssue(a: Pick<Issue, 'intent' | 'operands'>, b: Pick<Issue, 'intent' | 'operands'>): boolean {
  return a.intent.preset.id === b.intent.preset.id
    && JSON.stringify(a.intent.params) === JSON.stringify(b.intent.params)
    && JSON.stringify(a.operands) === JSON.stringify(b.operands)
}

export function findSame(d: Drafts, issue: Pick<Issue, 'intent' | 'operands'>): Issue | undefined {
  return d.issues.find(i => sameIssue(i, issue))
}

export function addIssue(d: Drafts, issue: Omit<Issue, 'seq'>): Step {
  if (findSame(d, issue)) return { drafts: d, outcome: 'exists' }
  const next: Issue = { ...issue, seq: d.nextSeq }
  return { drafts: record(d, [...d.issues, next], { kind: 'added', issue: next, index: d.issues.length }, d.nextSeq + 1), outcome: 'added' }
}

export function editIssue(d: Drafts, id: string, patch: IntentPatch, now: number): Step {
  const index = d.issues.findIndex(i => i.id === id)
  const cur = d.issues[index]
  if (!cur) return { drafts: d, outcome: 'missing' }
  if (cur.status !== 'draft') return { drafts: d, outcome: 'frozen' }
  const updated: Issue = { ...cur, intent: { ...cur.intent, ...patch }, updatedAt: new Date(now).toISOString() }
  const issues = d.issues.slice()
  issues[index] = updated
  const change: Change = { kind: 'edited', id, before: { intent: cur.intent, updatedAt: cur.updatedAt }, after: { intent: updated.intent, updatedAt: updated.updatedAt } }
  return { drafts: record(d, issues, change), outcome: 'updated' }
}

export function removeIssue(d: Drafts, id: string): Step {
  const index = d.issues.findIndex(i => i.id === id)
  const cur = d.issues[index]
  if (!cur) return { drafts: d, outcome: 'missing' }
  if (cur.status !== 'draft') return { drafts: d, outcome: 'frozen' }
  return { drafts: record(d, d.issues.filter(i => i.id !== id), { kind: 'removed', issue: cur, index }), outcome: 'removed' }
}

function insert(issues: Issue[], issue: Issue, index: number): Issue[] {
  const out = issues.filter(i => i.id !== issue.id)
  out.splice(Math.min(index, out.length), 0, issue)
  return out
}

function run(issues: Issue[], c: Change, forward: boolean): Issue[] {
  if (c.kind === 'edited') {
    const v = forward ? c.after : c.before
    return issues.map(i => i.id === c.id ? { ...i, intent: v.intent, updatedAt: v.updatedAt } : i)
  }
  const show = (c.kind === 'added') === forward
  return show ? insert(issues, c.issue, c.index) : issues.filter(i => i.id !== c.issue.id)
}

export function undoLast(d: Drafts): Step {
  const c = d.undo.at(-1)
  if (!c) return { drafts: d, outcome: 'empty' }
  return { drafts: { ...d, issues: run(d.issues, c, false), undo: d.undo.slice(0, -1), redo: [...d.redo, c] }, outcome: 'undone' }
}

export function redoLast(d: Drafts): Step {
  const c = d.redo.at(-1)
  if (!c) return { drafts: d, outcome: 'empty' }
  return { drafts: { ...d, issues: run(d.issues, c, true), undo: [...d.undo, c], redo: d.redo.slice(0, -1) }, outcome: 'redone' }
}

/** Replaces the queue with stored issues, e.g. after a reload. Undo history does not survive. */
export function restoreDrafts(issues: Issue[]): Drafts {
  const nextSeq = issues.reduce((m, i) => Math.max(m, i.seq), 0) + 1
  return { issues: [...issues].sort((a, b) => a.seq - b.seq), nextSeq, undo: [], redo: [] }
}

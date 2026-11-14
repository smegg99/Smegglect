// src/core/drafts.ts
// The single in-memory issue queue with undo. Persistence wraps it; it does not replace it.

import type { Intent, Issue } from './model'

const UNDO_DEPTH = 30

/** One reversible change: undo applies it backwards, redo forwards. */
type Change =
  | { kind: 'added', issue: Issue, index: number }
  | { kind: 'removed', issue: Issue, index: number }
  | {
    kind: 'edited',
    id: string,
    before: Pick<Issue, 'intent' | 'updatedAt'>,
    after: Pick<Issue, 'intent' | 'updatedAt'>,
  }

export interface Drafts {
  /** Numbered 1 to n in the order they were added: removing one closes the gap. */
  issues: Issue[]
  undo: Change[]
  redo: Change[]
}

export type Outcome =
  | 'added'
  | 'exists'
  | 'updated'
  | 'removed'
  | 'undone'
  | 'redone'
  | 'missing'
  | 'frozen'
  | 'empty'

export interface Step {
  drafts: Drafts
  outcome: Outcome
}

export type IntentPatch = Partial<Pick<Intent, 'note' | 'scope' | 'constraints' | 'params'>>

export function emptyDrafts(): Drafts {
  return { issues: [], undo: [], redo: [] }
}

/** Each draft's number is its place in the queue. */
export function numbered(issues: readonly Issue[]): Issue[] {
  return issues.map((issue, index) => issue.seq === index + 1 ? issue : { ...issue, seq: index + 1 })
}

/** A new change starts a new future: the redo stack is dropped. */
function record(drafts: Drafts, issues: Issue[], change: Change): Drafts {
  return { issues: numbered(issues), undo: [...drafts.undo, change].slice(-UNDO_DEPTH), redo: [] }
}

/** The same preset and choice on the same targets: one issue, however often it is reported. */
export function sameIssue(
  first: Pick<Issue, 'intent' | 'operands'>,
  second: Pick<Issue, 'intent' | 'operands'>,
): boolean {
  return first.intent.preset.id === second.intent.preset.id
    && JSON.stringify(first.intent.params) === JSON.stringify(second.intent.params)
    && first.intent.note.trim() === second.intent.note.trim()
    && JSON.stringify(first.operands) === JSON.stringify(second.operands)
}

export function findSame(drafts: Drafts, issue: Pick<Issue, 'intent' | 'operands'>): Issue | undefined {
  return drafts.issues.find(queued => sameIssue(queued, issue))
}

export function addIssue(drafts: Drafts, issue: Omit<Issue, 'seq'>): Step {
  if (findSame(drafts, issue)) return { drafts, outcome: 'exists' }
  const next: Issue = { ...issue, seq: drafts.issues.length + 1 }
  return {
    drafts: record(drafts, [...drafts.issues, next], { kind: 'added', issue: next, index: next.seq - 1 }),
    outcome: 'added',
  }
}

export function editIssue(drafts: Drafts, id: string, patch: IntentPatch, now: number): Step {
  const index = drafts.issues.findIndex(queued => queued.id === id)
  const cur = drafts.issues[index]
  if (!cur) return { drafts, outcome: 'missing' }
  if (cur.status !== 'draft') return { drafts, outcome: 'frozen' }
  const updated: Issue = {
    ...cur,
    intent: { ...cur.intent, ...patch },
    updatedAt: new Date(now).toISOString(),
  }
  const issues = drafts.issues.slice()
  issues[index] = updated
  const change: Change = {
    kind: 'edited',
    id,
    before: { intent: cur.intent, updatedAt: cur.updatedAt },
    after: { intent: updated.intent, updatedAt: updated.updatedAt },
  }
  return { drafts: record(drafts, issues, change), outcome: 'updated' }
}

export function removeIssue(drafts: Drafts, id: string): Step {
  const index = drafts.issues.findIndex(queued => queued.id === id)
  const cur = drafts.issues[index]
  if (!cur) return { drafts, outcome: 'missing' }
  if (cur.status !== 'draft') return { drafts, outcome: 'frozen' }
  const issues = drafts.issues.filter(queued => queued.id !== id)
  return {
    drafts: record(drafts, issues, { kind: 'removed', issue: cur, index }),
    outcome: 'removed',
  }
}

function insert(issues: Issue[], issue: Issue, index: number): Issue[] {
  const out = issues.filter(queued => queued.id !== issue.id)
  out.splice(Math.min(index, out.length), 0, issue)
  return out
}

function run(issues: Issue[], change: Change, forward: boolean): Issue[] {
  if (change.kind === 'edited') {
    const side = forward ? change.after : change.before
    return issues.map(queued => queued.id === change.id
      ? { ...queued, intent: side.intent, updatedAt: side.updatedAt }
      : queued)
  }
  const show = (change.kind === 'added') === forward
  return show
    ? insert(issues, change.issue, change.index)
    : issues.filter(queued => queued.id !== change.issue.id)
}

export function undoLast(drafts: Drafts): Step {
  const change = drafts.undo.at(-1)
  if (!change) return { drafts, outcome: 'empty' }
  return {
    drafts: {
      ...drafts,
      issues: numbered(run(drafts.issues, change, false)),
      undo: drafts.undo.slice(0, -1),
      redo: [...drafts.redo, change],
    },
    outcome: 'undone',
  }
}

export function redoLast(drafts: Drafts): Step {
  const change = drafts.redo.at(-1)
  if (!change) return { drafts, outcome: 'empty' }
  return {
    drafts: {
      ...drafts,
      issues: numbered(run(drafts.issues, change, true)),
      undo: [...drafts.undo, change],
      redo: drafts.redo.slice(0, -1),
    },
    outcome: 'redone',
  }
}

/** Replaces the queue with stored issues, e.g. after a reload. Undo history does not survive. */
export function restoreDrafts(issues: Issue[]): Drafts {
  return { issues: numbered([...issues].sort((first, second) => first.seq - second.seq)), undo: [], redo: [] }
}

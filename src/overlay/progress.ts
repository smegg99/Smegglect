// src/overlay/progress.ts
// What changed in the agent's progress between two status reads, and the toast it raises. Only fixed words
// reach the page; the first read after mounting is the baseline, so a reload repeats nothing.

import { markRaw } from 'vue'
import type { Issue } from '../core/model'
import { isAgentState, type IssueProgress } from '../core/review'
import type { BridgeStatus } from '../dom/bridge'
import { say } from './exporting'
import type { Runtime } from './runtime'

/** One sent issue whose progress read differently from the last time. */
export interface Change {
  batchId: string
  issueId: string
  seq: number
  from: IssueProgress | null
  to: IssueProgress
}

type Progress = NonNullable<BridgeStatus['issues']>

/** The last read per overlay; a page may mount more than one. */
const last = new WeakMap<Runtime['ui'], Progress>()
/** Overlays whose next read catches up on what came while they were folded: History, but no toast. */
const hushed = new WeakSet<Runtime['ui']>()

/** A sent issue this page holds; issues of batches sent from elsewhere are not named here. */
function sentIssue(rt: Runtime, batchId: string, issueId: string): Issue | undefined {
  const batch = rt.engine.session.store.get().submitted.find(candidate => candidate.id === batchId)
  return batch?.issues.find(issue => issue.id === issueId)
}

/** The changes since the last read; none for the first one, or when the status could not be read. */
export function noticeProgress(rt: Runtime, next: BridgeStatus | null): Change[] {
  if (!next?.issues) return []
  const before = last.get(rt.ui)
  last.set(rt.ui, next.issues)
  if (!before) return []
  const changes: Change[] = []
  for (const [batchId, issues] of Object.entries(next.issues)) {
    for (const [issueId, to] of Object.entries(issues)) {
      const from = before[batchId]?.[issueId] ?? null
      const issue = from === to ? undefined : sentIssue(rt, batchId, issueId)
      if (issue) changes.push({ batchId, issueId, seq: issue.seq, from, to })
    }
  }
  return changes
}

/** How long Show on page outlines the target it brought into view. */
const POINT_MS = 2000

/** Outlines a sent issue's target for a while, as a check does but without its line or History. */
function point(rt: Runtime, issue: Issue): void {
  const until = Date.now() + POINT_MS
  rt.ui.pointed = { issue: markRaw(issue), until }
  setTimeout(() => {
    if (rt.ui.pointed?.until === until) rt.ui.pointed = null
  }, POINT_MS)
}

/** The results worth a toast, by state: what the toast says for Claude and for any other agent. */
const RESULT_TEXT: Partial<Record<IssueProgress, [string, string]>> = {
  'needs-review': ['bridge.fixedClaude', 'bridge.fixedOther'],
  'partial': ['bridge.partialClaude', 'bridge.partialOther'],
  'blocked': ['bridge.blockedClaude', 'bridge.blockedOther'],
}

/** A toast for the results among the changes: one names its issue, several are summed up. */
export function announce(rt: Runtime, changes: readonly Change[]): void {
  const results = changes.filter(change => RESULT_TEXT[change.to])
  const [one] = results
  const texts = one && RESULT_TEXT[one.to]
  if (!one || !texts) return
  const { t, engine } = rt
  const isClaude = rt.ui.agentStatus?.agent.kind === 'claude'
  if (results.length > 1) {
    const count = results.length
    const text = isClaude ? t('bridge.finishedClaude', { count }) : t('bridge.finishedOther', { count })
    // A blocked one among them needs the person as much as one alone would.
    return say(rt, text, results.some(result => result.to === 'blocked'))
  }
  const [claude, other] = texts
  const issue = sentIssue(rt, one.batchId, one.issueId)
  // Offered only where it can act: the target is drawn on this page.
  const here = issue && engine.locate(issue) === 'live'
  const run = () => {
    engine.reveal(one.issueId)
    if (issue) point(rt, issue)
  }
  const action = here ? { label: t('bridge.showOnPage'), run } : undefined
  say(rt, t(isClaude ? claude : other, { seq: one.seq }), one.to === 'blocked', action)
}

/** The agent as History names it. */
export const agentOf = (rt: Runtime): 'claude' | 'other' => {
  return rt.ui.agentStatus?.agent.kind === 'claude' ? 'claude' : 'other'
}

/** No agent has these: an issue that leaves them was taken up, whether or not a read saw it held. */
const UNTAKEN: readonly (IssueProgress | null)[] = [null, 'waiting', 'stalled']

/**
 * History lines for the agent's steps: each report it took, and each state it gave an issue. Their ids are
 * fixed, so the windows that share the project's History store each step once.
 */
export function record(rt: Runtime, changes: readonly Change[]): void {
  const agent = agentOf(rt)
  const log = rt.engine.session.log
  const taken = changes.filter(change => UNTAKEN.includes(change.from) && !UNTAKEN.includes(change.to))
  for (const batchId of new Set(taken.map(change => change.batchId))) {
    log({ id: `evt_taken_${batchId}`, kind: 'taken', batchId, agent })
  }
  for (const { batchId, issueId, seq, from, to } of changes) {
    // Back from stalled the agent goes on with what it began; that is no new step.
    if (!isAgentState(to) || (to === 'in-progress' && from === 'stalled')) continue
    log({ id: `evt_${to}_${issueId}`, kind: 'answered', batchId, issueId, seq, state: to, agent })
  }
}

/** The next read catches up quietly: the feed starts again once the folded overlay opens. */
export function hush(rt: Runtime): void {
  hushed.add(rt.ui)
}

/** The next read is a fresh baseline: the person turned the agent's status back on after a while without. */
export function restart(rt: Runtime): void {
  last.delete(rt.ui)
}

/** Takes in a status read: History for what changed since the last one, a toast unless it is a catch-up. */
export function follow(rt: Runtime, status: BridgeStatus | null): void {
  const changes = noticeProgress(rt, status)
  record(rt, changes)
  if (status && !hushed.delete(rt.ui)) announce(rt, changes)
}

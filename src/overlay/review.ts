// src/overlay/review.ts
// The person's review of sent issues: their labels, which ones the page keeps marked, and recording a decision.

import type { FollowUp, Issue } from '../core/model'
import { issueState, type IssueState } from '../core/review'
import type { SessionState } from '../dom/session'
import type { Runtime } from './runtime'

const STATE_KEY: Record<IssueState, string> = {
  'submitted': 'review.submitted', 'in-progress': 'review.inProgress', 'partial': 'review.partial', 'blocked': 'review.blocked',
  'needs-review': 'review.needsReview', 'accepted': 'review.accepted', 'reopened': 'review.reopened',
}
const REASON_KEY: Record<string, string> = {
  'still-happens': 'review.stillHappens', 'wrong-target': 'review.wrongTarget', 'one-viewport': 'review.oneViewport', 'new-problem': 'review.newProblem',
}

export const stateText = (rt: Pick<Runtime, 't'>, s: IssueState | undefined) => rt.t(STATE_KEY[s ?? 'submitted']!)
export const reasonText = (rt: Pick<Runtime, 't'>, r: string) => rt.t(REASON_KEY[r] ?? '') || r

/** States the agent has touched and the person has not closed: these stay marked on the page. */
const MARKED = new Set<IssueState>(['in-progress', 'needs-review', 'partial', 'blocked', 'reopened'])

export interface SentIssue {
  issue: Issue
  batchId: string
  state: IssueState
}

export function sentIssues(sess: SessionState): SentIssue[] {
  return sess.submitted.flatMap(b => b.issues.map(issue => ({ issue, batchId: b.id, state: issueState(sess.followUps[b.id] ?? [], issue.id) })))
}

export const marked = (sess: SessionState) => sentIssues(sess).filter(s => MARKED.has(s.state))

/** Recorded here, and on the bridge when the batch was made available to agents. */
export async function reviewIssue(rt: Runtime, batchId: string, issueId: string, state: 'accepted' | 'partial' | 'reopened', more: { reason?: FollowUp['reason'], text?: string } = {}) {
  const res = await rt.engine.session.addFollowUp({ batchId, issueId, kind: 'review', actor: 'human', text: more.text ?? '', state, ...(more.reason ? { reason: more.reason } : {}) })
  if (res.followUp && rt.sess.value.shared[batchId]) await rt.engine.bridge?.addFollowUp(res.followUp)
}

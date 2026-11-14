// src/core/review.ts
// Issue state after submission, derived only from append-only follow-ups.

import type { FollowUp } from './model'

export type IssueState = 'submitted' | 'in-progress' | 'partial' | 'blocked' | 'needs-review' | 'accepted' | 'reopened'

/** What an agent may claim. Acceptance and reopening are human decisions. */
export const AGENT_STATES = ['in-progress', 'partial', 'blocked', 'needs-review'] as const
export const HUMAN_STATES = ['accepted', 'reopened', 'partial'] as const
export const REOPEN_REASONS = ['still-happens', 'wrong-target', 'one-viewport', 'new-problem'] as const

export function allowedState(f: Pick<FollowUp, 'kind' | 'actor' | 'state'>): boolean {
  if (f.kind === 'note') return f.state === undefined
  if (f.kind === 'result') return f.actor === 'agent' && (AGENT_STATES as readonly string[]).includes(f.state ?? '')
  return f.actor === 'human' && (HUMAN_STATES as readonly string[]).includes(f.state ?? '')
}

/**
 * Latest decision wins, except that after a human acceptance only a human review changes the state:
 * a late or duplicate agent result is history, not a new verdict.
 */
export function issueState(followUps: readonly FollowUp[], issueId: string): IssueState {
  let state: IssueState = 'submitted'
  const ordered = followUps.filter(f => f.issueId === issueId && f.state && allowedState(f))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  for (const f of ordered) {
    if (state === 'accepted' && f.actor !== 'human') continue
    state = f.state as IssueState
  }
  return state
}

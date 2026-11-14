// src/core/review.ts
// Follow-ups after submission: the fields one may hold, and the issue state derived only from the agent's
// append-only results.

import { AGENT_STATES, CHECK_OUTCOMES, type AgentState, type CheckOutcome, type FollowUp } from './model'
import { isId, LIMITS } from './limits'

export type IssueState = 'submitted' | AgentState

/** How far an agent has got with one sent issue, as the page shows it: a word from a fixed set. */
export type IssueProgress = 'waiting' | 'taken' | 'stalled' | AgentState

export const ISSUE_PROGRESS: readonly IssueProgress[] = ['waiting', 'taken', 'stalled', ...AGENT_STATES]

export function isAgentState(value: unknown): value is AgentState {
  return (AGENT_STATES as readonly unknown[]).includes(value)
}

export function isCheckOutcome(value: unknown): value is CheckOutcome {
  return (CHECK_OUTCOMES as readonly unknown[]).includes(value)
}

/** A note carries no state; a result is the agent's, with a state it may claim. */
export function allowedState(followUp: Pick<FollowUp, 'kind' | 'actor' | 'state'>): boolean {
  if (followUp.kind === 'note') return followUp.state === undefined
  return followUp.kind === 'result' && followUp.actor === 'agent' && isAgentState(followUp.state)
}

/** A project-relative path the agent changed, within the length limit. */
export function isChangedFile(path: unknown): path is string {
  if (typeof path !== 'string') return false
  return !path.startsWith('/') && !path.includes('..') && path.length <= LIMITS.text
}

type Fields = Record<string, unknown>

const isFields = (value: unknown): value is Fields => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The changed files, a copy; null when the list is too long or one path does not fit. */
function filesOf(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined
  const fits = Array.isArray(value) && value.length <= LIMITS.files && value.every(isChangedFile)
  return fits ? [...value] : null
}

/** The checks, each rebuilt from its command and outcome; null when too many or one does not fit. */
function checksOf(value: unknown): FollowUp['checks'] | null {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > LIMITS.checks) return null
  const checks: NonNullable<FollowUp['checks']> = []
  for (const check of value) {
    const fields: Fields = isFields(check) ? check : {}
    const { command, outcome } = fields
    const fits = typeof command === 'string' && command.length <= LIMITS.command && isCheckOutcome(outcome)
    if (!fits) return null
    checks.push({ command, outcome })
  }
  return checks
}

/** A follow-up from a request or from disk, rebuilt from its known fields when every one fits; else null. */
export function parseFollowUp(input: unknown): FollowUp | null {
  if (!isFields(input)) return null
  const { id, batchId, issueId, kind, actor, createdAt, text, state } = input
  if (!isId(id) || !isId(batchId) || !isId(issueId)) return null
  if ((kind !== 'note' && kind !== 'result') || (actor !== 'human' && actor !== 'agent')) return null
  if (typeof createdAt !== 'string' || createdAt.length > LIMITS.name) return null
  if (typeof text !== 'string' || text.length > LIMITS.note) return null
  if (state !== undefined && !isAgentState(state)) return null
  if (!allowedState({ kind, actor, state })) return null
  const files = filesOf(input.files)
  const checks = checksOf(input.checks)
  if (files === null || checks === null) return null
  return {
    id, batchId, issueId, kind, actor, createdAt, text,
    ...(state === undefined ? {} : { state }),
    ...(files === undefined ? {} : { files }),
    ...(checks === undefined ? {} : { checks }),
  }
}

/** The latest agent result's state; `submitted` until there is one. */
export function issueState(followUps: readonly FollowUp[], issueId: string): IssueState {
  const results = followUps
    .filter(followUp => followUp.issueId === issueId && followUp.kind === 'result' && allowedState(followUp))
    .sort((first, second) => first.createdAt.localeCompare(second.createdAt)
      || first.id.localeCompare(second.id))
  return results[results.length - 1]?.state ?? 'submitted'
}

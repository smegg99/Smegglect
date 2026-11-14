// src/core/review.test.ts
import { describe, expect, it } from 'vitest'
import type { FollowUp } from './model'
import { allowedState, issueState } from './review'

const f = (over: Partial<FollowUp>): FollowUp => ({
  id: `fol_${over.createdAt ?? 'x'}`, batchId: 'bat_1', issueId: 'iss_1', kind: 'result', actor: 'agent', createdAt: '1', text: '', ...over,
})

describe('review state', () => {
  it('starts submitted and follows agent results', () => {
    expect(issueState([], 'iss_1')).toBe('submitted')
    expect(issueState([f({ state: 'in-progress', createdAt: '1' }), f({ state: 'needs-review', createdAt: '2' })], 'iss_1')).toBe('needs-review')
  })

  it('lets only a human accept or reopen', () => {
    expect(allowedState({ kind: 'result', actor: 'agent', state: 'accepted' })).toBe(false)
    expect(allowedState({ kind: 'review', actor: 'agent', state: 'accepted' })).toBe(false)
    expect(allowedState({ kind: 'review', actor: 'human', state: 'accepted' })).toBe(true)
    expect(issueState([f({ state: 'accepted', createdAt: '1' })], 'iss_1')).toBe('submitted')
  })

  it('keeps acceptance against a late agent result until a human reopens', () => {
    const list = [
      f({ state: 'needs-review', createdAt: '1' }),
      f({ kind: 'review', actor: 'human', state: 'accepted', createdAt: '2' }),
      f({ state: 'needs-review', createdAt: '3', text: 'stale' }),
    ]
    expect(issueState(list, 'iss_1')).toBe('accepted')
    expect(issueState([...list, f({ kind: 'review', actor: 'human', state: 'reopened', reason: 'still-happens', createdAt: '4' })], 'iss_1')).toBe('reopened')
  })
})

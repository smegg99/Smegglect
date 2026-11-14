// src/core/review.test.ts
import { describe, expect, it } from 'vitest'
import type { FollowUp } from './model'
import { allowedState, issueState, parseFollowUp } from './review'

const f = (over: Partial<FollowUp>): FollowUp => ({
  id: `fol_${over.createdAt ?? 'x'}`, batchId: 'bat_1', issueId: 'iss_1', kind: 'result', actor: 'agent', createdAt: '1', text: '', ...over,
})

describe('review state', () => {
  it('starts submitted and follows agent results', () => {
    expect(issueState([], 'iss_1')).toBe('submitted')
    expect(issueState([f({ state: 'in-progress', createdAt: '1' }), f({ state: 'needs-review', createdAt: '2' })], 'iss_1')).toBe('needs-review')
  })

  it('allows a note without a state and an agent result with an agent state, nothing else', () => {
    expect(allowedState({ kind: 'note', actor: 'human', state: undefined })).toBe(true)
    expect(allowedState({ kind: 'result', actor: 'agent', state: 'blocked' })).toBe(true)
    expect(allowedState({ kind: 'result', actor: 'human', state: 'blocked' })).toBe(false)
    expect(allowedState({ kind: 'result', actor: 'agent', state: undefined })).toBe(false)
  })
})

describe('follow-up parsing', () => {
  const result = { ...f({ id: 'res_1', state: 'needs-review', createdAt: '2026-11-14T02:00:00Z' }), files: ['src/App.vue'], checks: [{ command: 'bun test', outcome: 'passed' }] }

  it('rebuilds a fitting follow-up from its known fields only', () => {
    const extra = { ...result, reason: 'x', checks: [{ command: 'bun test', outcome: 'passed', extra: 1 }] }
    expect(parseFollowUp(extra)).toEqual(result)
    const note = f({ kind: 'note', actor: 'human', text: 'hi' })
    expect(parseFollowUp({ ...note, state: undefined })).toStrictEqual(note)
  })

  it('refuses a follow-up with any field that does not fit', () => {
    const bad: unknown[] = [
      null, [], { ...result, createdAt: undefined }, { ...result, createdAt: 3 }, { ...result, text: 3 },
      { ...result, id: '../x' }, { ...result, kind: 'review' }, { ...result, actor: 'robot' },
      { ...result, state: 'accepted' }, { ...result, files: 'src/App.vue' }, { ...result, files: ['/etc/passwd'] },
      { ...result, files: ['../up'] }, { ...result, checks: {} }, { ...result, checks: [null] },
      { ...result, checks: [{ command: 'x', outcome: 'done' }] }, { ...result, checks: [{ outcome: 'passed' }] },
      { ...result, kind: 'note' },
    ]
    for (const input of bad) expect(parseFollowUp(input)).toBeNull()
  })
})

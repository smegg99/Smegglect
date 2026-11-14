// src/core/drafts.test.ts
import { describe, expect, it } from 'vitest'
import { addIssue, editIssue, emptyDrafts, redoLast, removeIssue, undoLast } from './drafts'
import { issue } from './validate.test'

const at = (ms: number) => new Date(ms).toISOString()

describe('drafts', () => {
  it('numbers issues by sequence, not array position', () => {
    let d = emptyDrafts()
    d = addIssue(d, issue({ id: 'iss_a', createdAt: at(0) })).drafts
    d = addIssue(d, issue({ id: 'iss_b', createdAt: at(5000), intent: { ...issue().intent, params: { x: '1' } } })).drafts
    d = removeIssue(d, 'iss_a').drafts
    expect(d.issues.map(i => [i.id, i.seq])).toEqual([['iss_b', 2]])
  })

  it('refuses the same preset and choice on the same targets, at any time', () => {
    let d = emptyDrafts()
    d = addIssue(d, issue({ id: 'iss_a', createdAt: at(0) })).drafts
    expect(addIssue(d, issue({ id: 'iss_b', createdAt: at(60_000) })).outcome).toBe('exists')
    const other = addIssue(d, issue({ id: 'iss_c', intent: { ...issue().intent, params: { edge: 'left' } } }))
    expect(other.outcome).toBe('added')
  })

  it('undoes add, edit and remove in order', () => {
    let d = addIssue(emptyDrafts(), issue({ id: 'iss_a', createdAt: at(0) })).drafts
    d = editIssue(d, 'iss_a', { note: 'short note', scope: 'screen' }, 10).drafts
    expect(d.issues[0]?.intent.scope).toBe('screen')
    d = removeIssue(d, 'iss_a').drafts
    expect(d.issues).toHaveLength(0)
    d = undoLast(d).drafts
    expect(d.issues[0]?.intent.note).toBe('short note')
    d = undoLast(d).drafts
    expect(d.issues[0]?.intent.note).toBe('')
    d = undoLast(d).drafts
    expect(d.issues).toHaveLength(0)
    expect(undoLast(d).outcome).toBe('empty')
  })

  it('redoes exactly what was undone and drops the future on a new change', () => {
    let d = addIssue(emptyDrafts(), issue({ id: 'iss_a' })).drafts
    d = editIssue(d, 'iss_a', { note: 'n1' }, 10).drafts
    d = removeIssue(d, 'iss_a').drafts
    d = undoLast(undoLast(undoLast(d).drafts).drafts).drafts
    expect(d.issues).toHaveLength(0)
    d = redoLast(d).drafts
    expect(d.issues[0]?.intent.note).toBe('')
    d = redoLast(d).drafts
    expect(d.issues[0]?.intent.note).toBe('n1')
    d = redoLast(d).drafts
    expect(d.issues).toHaveLength(0)
    expect(redoLast(d).outcome).toBe('empty')
    d = undoLast(d).drafts
    d = editIssue(d, 'iss_a', { note: 'n2' }, 20).drafts
    expect(d.redo).toHaveLength(0)
  })

  it('refuses edits to submitted evidence', () => {
    const d = addIssue(emptyDrafts(), issue({ id: 'iss_a', status: 'submitted', createdAt: at(0) })).drafts
    expect(editIssue(d, 'iss_a', { note: 'x' }, 1).outcome).toBe('frozen')
    expect(removeIssue(d, 'iss_a').outcome).toBe('frozen')
  })
})

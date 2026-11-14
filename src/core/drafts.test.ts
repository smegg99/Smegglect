// src/core/drafts.test.ts
import { describe, expect, it } from 'vitest'
import { addIssue, editIssue, emptyDrafts, redoLast, removeIssue, restoreDrafts, undoLast, type Drafts } from './drafts'
import { issue } from './validate.test'

const at = (ms: number) => new Date(ms).toISOString()

describe('drafts', () => {
  it('numbers the drafts 1 to n in the order they were added; one taken back frees its number', () => {
    const other = (id: string, x: string) => issue({ id, intent: { ...issue().intent, params: { x } } })
    const numbers = (d: Drafts) => d.issues.map(i => [i.id, i.seq])
    let d = addIssue(emptyDrafts(), issue({ id: 'iss_a' })).drafts
    d = removeIssue(d, 'iss_a').drafts
    // One added and deleted: the next is issue 1 again, not 2.
    d = addIssue(d, issue({ id: 'iss_b' })).drafts
    expect(numbers(d)).toEqual([['iss_b', 1]])
    d = undoLast(d).drafts
    d = addIssue(d, issue({ id: 'iss_c' })).drafts
    expect(numbers(d)).toEqual([['iss_c', 1]])
    d = addIssue(d, other('iss_d', '1')).drafts
    d = addIssue(d, other('iss_e', '2')).drafts
    d = removeIssue(d, 'iss_d').drafts
    expect(numbers(d)).toEqual([['iss_c', 1], ['iss_e', 2]])
    d = undoLast(d).drafts
    expect(numbers(d)).toEqual([['iss_c', 1], ['iss_d', 2], ['iss_e', 3]])
    d = redoLast(d).drafts
    expect(numbers(d)).toEqual([['iss_c', 1], ['iss_e', 2]])
  })

  it('numbers stored drafts with gaps 1 to n, in their stored order', () => {
    const stored = [issue({ id: 'iss_b', seq: 5 }), issue({ id: 'iss_a', seq: 2 })]
    expect(restoreDrafts(stored).issues.map(i => [i.id, i.seq])).toEqual([['iss_a', 1], ['iss_b', 2]])
  })

  it('refuses the same preset and choice on the same targets, at any time', () => {
    let d = emptyDrafts()
    d = addIssue(d, issue({ id: 'iss_a', createdAt: at(0) })).drafts
    expect(addIssue(d, issue({ id: 'iss_b', createdAt: at(60_000) })).outcome).toBe('exists')
    const other = addIssue(d, issue({ id: 'iss_c', intent: { ...issue().intent, params: { edge: 'left' } } }))
    expect(other.outcome).toBe('added')
  })

  it('counts a different note on the same target as a different issue', () => {
    const noted = (id: string, note: string) => issue({ id, intent: { ...issue().intent, note } })
    let d = addIssue(emptyDrafts(), noted('iss_a', 'Too pale')).drafts
    expect(addIssue(d, noted('iss_b', 'Wrong icon')).outcome).toBe('added')
    d = addIssue(d, noted('iss_b', 'Wrong icon')).drafts
    expect(addIssue(d, noted('iss_c', ' Too pale ')).outcome).toBe('exists')
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

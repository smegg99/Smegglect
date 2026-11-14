// src/core/modes.test.ts
import { describe, expect, it } from 'vitest'
import { escape, initial, ownsPointer, reduce, type InspectState } from './modes'

type S = InspectState<string>

describe('modes', () => {
  it('toggles pick and region as exclusive input modes', () => {
    let s: S = initial()
    s = reduce(s, { type: 'toggle-pick' })
    expect(s.mode.kind).toBe('pick')
    s = reduce(s, { type: 'toggle-region' })
    expect(s.mode.kind).toBe('region')
    s = reduce(s, { type: 'toggle-region' })
    expect(s.mode.kind).toBe('pass')
  })

  it('selects only while picking; a plain pick ends the mode, extending keeps it for the group', () => {
    let s: S = reduce(initial<string>(), { type: 'select', handle: 'a' })
    expect(s.selection.kind).toBe('none')
    s = reduce(reduce(s, { type: 'toggle-pick' }), { type: 'select', handle: 'a' })
    expect(s).toEqual({ mode: { kind: 'pass' }, selection: { kind: 'dom', handle: 'a' } })
    s = reduce(reduce(s, { type: 'toggle-pick' }), { type: 'select', handle: 'b', extend: true })
    expect(s).toEqual({ mode: { kind: 'pick' }, selection: { kind: 'group', handles: ['a', 'b'] } })
    s = reduce(s, { type: 'select', handle: 'b', extend: true })
    expect(s.selection).toEqual({ kind: 'dom', handle: 'a' })
    expect(s.mode.kind).toBe('pick')
  })

  it('drops one member of a group by its place; one left is a plain selection', () => {
    const group: S = { mode: { kind: 'pass' }, selection: { kind: 'group', handles: ['a', 'b', 'c'] } }
    let s = reduce(group, { type: 'drop', index: 1 })
    expect(s).toEqual({ mode: { kind: 'pass' }, selection: { kind: 'group', handles: ['a', 'c'] } })
    s = reduce(s, { type: 'drop', index: 0 })
    expect(s.selection).toEqual({ kind: 'dom', handle: 'c' })
    expect(reduce(s, { type: 'drop', index: 0 })).toBe(s)
    expect(reduce(group, { type: 'drop', index: 3 })).toBe(group)
    const asking: S = { ...group, mode: { kind: 'reference', preset: 'align', params: {}, resume: 'pass' } }
    expect(reduce(asking, { type: 'drop', index: 0 })).toBe(asking)
  })

  it('needs a dom or group selection to choose a reference', () => {
    const none = reduce(initial<string>(), { type: 'need-reference', preset: 'match-height', params: {} })
    expect(none.mode.kind).toBe('pass')
    let s: S = reduce(reduce(initial<string>(), { type: 'toggle-pick' }), { type: 'select', handle: 'a' })
    s = reduce(s, { type: 'need-reference', preset: 'match-height', params: {} })
    expect(s.mode).toEqual({ kind: 'reference', preset: 'match-height', params: {}, resume: 'pass' })
    expect(reduce(s, { type: 'toggle-pick' })).toBe(s)
  })

  it('escape unwinds one owned operation at a time and keeps the prior selection', () => {
    let s: S = reduce(reduce(initial<string>(), { type: 'toggle-pick' }), { type: 'select', handle: 'a', extend: true })
    s = reduce(s, { type: 'need-reference', preset: 'match-width', params: {} })
    s = escape(s)!
    expect(s.mode.kind).toBe('pick')
    expect(s.selection).toEqual({ kind: 'dom', handle: 'a' })
    s = escape(s)!
    expect(s.mode.kind).toBe('pass')
    s = escape(s)!
    expect(s.selection.kind).toBe('none')
    expect(escape(s)).toBeNull()
  })

  it('region drag needs a start and produces a region selection', () => {
    let s: S = reduce(initial<string>(), { type: 'toggle-region' })
    expect(reduce(s, { type: 'drag-end', rect: { x: 0, y: 0, width: 5, height: 5 } })).toBe(s)
    s = reduce(s, { type: 'drag-start', point: { x: 1, y: 2 } })
    s = reduce(s, { type: 'drag-end', rect: { x: 1, y: 2, width: 30, height: 40 } })
    expect(s.selection.kind).toBe('region')
    expect(s.mode).toEqual({ kind: 'pass' })
  })

  it('owns the pointer only outside pass-through', () => {
    expect(ownsPointer({ kind: 'pass' })).toBe(false)
    expect(ownsPointer({ kind: 'pick' })).toBe(true)
  })
})

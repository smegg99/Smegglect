// src/core/presets.test.ts
import { describe, expect, it } from 'vitest'
import { createRegistry, editable, type PresetDef } from './presets'

const custom: PresetDef = {
  id: 'project.tap-target', version: 1, category: 'size', icon: 'size', applies: ['dom'], operands: 'single',
  evidence: ['box'], note: 'optional', label: 'Tap target too small', summary: 'Make {a} a comfortable tap target.',
}

describe('presets', () => {
  it('accepts namespaced project presets with plain-text copy', () => {
    const reg = createRegistry([custom])
    expect(reg.byId.get('project.tap-target')?.label).toBe('Tap target too small')
  })

  it('rejects project presets that carry functions or squat built-in ids', () => {
    expect(() => createRegistry([{ ...custom, render: () => 'x' } as unknown as PresetDef])).toThrow(/functions/)
    expect(() => createRegistry([{ ...custom, id: 'size' }])).toThrow(/project\.name/)
  })

  it('keeps Behaviour apart from Missing state: no feedback is a missing state', () => {
    const reg = createRegistry()
    expect(reg.byId.get('feedback')?.choice?.options).toEqual(['does-nothing', 'wrong-result'])
    expect(reg.byId.get('state-missing')?.choice?.options).toContain('loading')
  })

  it('marks unknown ids and other versions read-only', () => {
    const reg = createRegistry()
    expect(editable(reg, { id: 'size', version: 1 })).toBe(true)
    expect(editable(reg, { id: 'size', version: 2 })).toBe(false)
    expect(editable(reg, { id: 'project.gone', version: 1 })).toBe(false)
  })
})

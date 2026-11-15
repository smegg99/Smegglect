// src/overlay/actions.test.ts
import { describe, expect, it } from 'vitest'
import { createRegistry, type PresetDef } from '../core/presets'
import { actionGroups } from './actions'
import type { PresetUse } from './settings'

const project: PresetDef = {
  id: 'project.tap-target', version: 1, category: 'size', icon: 'size', applies: ['dom', 'group'], operands: 'single',
  evidence: ['box'], note: 'optional', label: 'Tap target too small', summary: 'Make {a} a comfortable tap target.',
}
const reg = createRegistry([project])
const none: PresetUse[] = []
const label = (id: string) => id
const ids = (kind: 'dom' | 'group' | 'region', quick = none) => actionGroups(reg, kind, quick, label).map(g => [g.id, g.tiles.map(t => t.preset)])

describe('actionGroups', () => {
  it('lists element presets in fixed groups and order, project presets last', () => {
    expect(ids('dom')).toEqual([
      ['size', ['size', 'spacing', 'edge-room', 'touch-target', 'off-scale']],
      ['fit', ['clipped', 'overflow', 'scrollbar-covers', 'overlap', 'text-wrap']],
      ['align', ['align', 'center', 'placement', 'match-height', 'match-width']],
      ['look', ['readability', 'text-wrong', 'wrong-color', 'icon', 'shape', 'control', 'design-system', 'like-app']],
      ['access', ['feedback', 'state-missing', 'wrong-state', 'visibility', 'jumps', 'motion', 'keyboard', 'a11y-name']],
      ['differs', ['consistent-padding', 'consistent-margin', 'consistent-gap', 'consistent-size', 'consistent-radius', 'consistent-type', 'consistent-color', 'inconsistent']],
      ['other', ['responsive', 'simplify', 'remove', 'note']],
      ['project', ['project.tap-target']],
    ])
  })

  it('lists every built-in preset at most once for each kind of selection', () => {
    for (const kind of ['dom', 'group', 'region'] as const) {
      const all = ids(kind).flatMap(([, t]) => t as string[])
      expect(new Set(all).size, kind).toBe(all.length)
    }
  })

  it('gives a group its alignment presets and compares members without asking for B', () => {
    const groups = actionGroups(reg, 'group', none, label)
    expect(groups.find(g => g.id === 'align')!.tiles.map(t => [t.preset, t.needsB])).toEqual([
      ['group-align', false], ['equal-gaps', false], ['align', true], ['center', false], ['placement', false],
      ['match-height', true], ['match-width', true],
    ])
    // The consistency checks compare the members; "looks inconsistent with B" still asks for B.
    const differs = groups.find(g => g.id === 'differs')!.tiles
    expect(differs.filter(t => t.needsB).map(t => t.preset)).toEqual(['inconsistent'])
  })

  it('marks every "differs from another" check on one element as asking for B', () => {
    const tiles = actionGroups(reg, 'dom', none, label).find(g => g.id === 'differs')!.tiles
    expect(tiles.every(t => t.needsB)).toBe(true)
  })

  it('offers a region only what applies to a region', () => {
    expect(ids('region').flatMap(([, t]) => t)).toEqual([
      'size', 'spacing', 'clipped', 'overflow', 'scrollbar-covers', 'readability', 'text-wrong', 'design-system',
      'like-app', 'feedback', 'visibility', 'jumps', 'motion', 'keyboard', 'responsive', 'layout', 'simplify',
      'remove', 'note',
    ])
  })

  it('puts saved favourites first, with their choice, when they apply', () => {
    const favourites: PresetUse[] = [{ preset: 'size', params: { observed: 'too-wide' } }, { preset: 'layout', params: { observed: 'crowded' } }]
    const first = actionGroups(reg, 'dom', favourites, label)[0]!
    expect(first.id).toBe('favourites')
    expect(first.tiles.map(t => [t.preset, t.params])).toEqual([['size', { observed: 'too-wide' }]])
    expect(actionGroups(reg, 'dom', none, label)[0]!.id).toBe('size')
  })
})

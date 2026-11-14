// src/core/compare.test.ts
import { describe, expect, it } from 'vitest'
import { compare, onScale } from './compare'
import type { Rect, TargetEvidence } from './model'
import { createRegistry } from './presets'

const reg = createRegistry()
const box = (width: number, height: number): Rect => ({ x: 0, y: 0, width, height })

function ev(properties: Record<string, string>, bounds = box(100, 40), extra: Partial<TargetEvidence> = {}): TargetEvidence {
  return { bounds, transformed: false, properties, source: { quality: 'visual-only', provenance: 'none' }, ...extra }
}

const pad = (t: string, r: string, b: string, l: string) => ({ 'padding-top': t, 'padding-right': r, 'padding-bottom': b, 'padding-left': l })

describe('compare', () => {
  it('flags only the A/B rows that differ', () => {
    const c = compare(reg.byId.get('consistent-padding'), {}, ev(pad('8px', '12px', '8px', '12px')), ev(pad('8px', '16px', '8px', '16px')))
    expect(c?.columns).toEqual(['A', 'B'])
    expect(c?.rows.filter(r => r.flagged).map(r => r.property)).toEqual(['padding-right', 'padding-left'])
  })

  it('reads width and height from bounds', () => {
    const c = compare(reg.byId.get('consistent-size'), {}, ev({}, box(100, 40)), ev({}, box(100, 36.25)))
    expect(c?.rows).toEqual([
      { property: 'width', values: ['100px', '100px'], flagged: false },
      { property: 'height', values: ['40px', '36.3px'], flagged: true },
    ])
  })

  it('compares every group member and numbers the columns', () => {
    const group = ev({}, box(300, 40), {
      members: [box(80, 40), box(80, 40), box(96, 40)],
      memberProperties: [{ 'row-gap': 'normal', 'column-gap': '8px' }, { 'row-gap': 'normal', 'column-gap': '8px' }, { 'row-gap': 'normal', 'column-gap': '12px' }],
    })
    const c = compare(reg.byId.get('consistent-gap'), {}, group)
    expect(c?.columns).toEqual(['1', '2', '3'])
    expect(c?.rows.map(r => [r.property, r.flagged])).toEqual([['row-gap', false], ['column-gap', true]])
  })

  it('checks a single element against the chosen spacing scale', () => {
    const a = ev({ ...pad('8px', '6px', '8px', '0px'), 'row-gap': 'normal' }, box(96, 44))
    const four = compare(reg.byId.get('off-scale'), { scale: 'grid-4' }, a)
    expect(four?.rows.filter(r => r.flagged).map(r => r.property)).toEqual(['padding-right'])
    expect(four?.rows.some(r => r.property === 'row-gap')).toBe(false)
    const eight = compare(reg.byId.get('off-scale'), { scale: 'grid-8' }, a)
    expect(eight?.rows.filter(r => r.flagged).map(r => r.property)).toEqual(['padding-right', 'height'])
  })

  it('has nothing to compare for presets without a property list', () => {
    expect(compare(reg.byId.get('note'), {}, ev({}))).toBeNull()
  })

  it('treats 0 and every px number in a shorthand', () => {
    expect(onScale('0px', 8)).toBe(true)
    expect(onScale('8px 16px', 8)).toBe(true)
    expect(onScale('8px 12px', 8)).toBe(false)
  })
})

// src/overlay/guides.test.ts
import { describe, expect, it } from 'vitest'
import type { BoxModel } from '../dom/boxmodel'
import { boxGuides, inset } from './guides'

const zero = { top: 0, right: 0, bottom: 0, left: 0 }

describe('boxGuides', () => {
  it('draws the padding box inside the border and labels each non-zero side', () => {
    const box: BoxModel = { margin: zero, border: { top: 1, right: 1, bottom: 1, left: 1 }, padding: { top: 8, right: 0, bottom: 8, left: 0 } }
    const d = boxGuides({ x: 0, y: 0, width: 100, height: 40 }, box)
    expect(d.boxes).toEqual([{ rect: { x: 1, y: 1, width: 98, height: 38 }, kind: 'padding' }])
    expect(d.labels.filter(l => l.kind === 'pad').map(l => l.text)).toEqual(['8', '8'])
    expect(d.labels.some(l => l.kind === 'mar')).toBe(false)
  })

  it('draws the margin box outside the element', () => {
    const box: BoxModel = { margin: { top: 4, right: 0, bottom: 12, left: 0 }, border: zero, padding: zero }
    const d = boxGuides({ x: 10, y: 10, width: 50, height: 20 }, box)
    expect(d.boxes).toEqual([{ rect: { x: 10, y: 6, width: 50, height: 36 }, kind: 'margin' }])
    expect(d.labels.filter(l => l.kind === 'mar').map(l => l.text)).toEqual(['4', '12'])
  })
})

describe('inset', () => {
  it('labels the distance from each inner edge to the outer edge', () => {
    const d = inset({ x: 10, y: 10, width: 20, height: 20 }, { x: 0, y: 0, width: 100, height: 100 })
    expect(d.labels.map(l => l.text)).toEqual(['10', '70', '10', '70'])
    expect(d.boxes).toEqual([])
  })
})

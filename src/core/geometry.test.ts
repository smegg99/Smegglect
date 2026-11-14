// src/core/geometry.test.ts
import { describe, expect, it } from 'vitest'
import { axis, gaps, horizontalGuide, intersection, px, relate, union, verticalGuide } from './geometry'

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

describe('geometry', () => {
  it('keeps fractional values and rounds only labels', () => {
    const rel = relate(r(10.25, 0, 100.5, 20), r(130.75, 0, 50, 20))
    expect(rel.horizontal).toEqual({ kind: 'gap', distance: 20 })
    expect(rel.delta.width).toBeCloseTo(-50.5)
    expect(px(20.04)).toBe('20')
    expect(px(-0.04)).toBe('0')
    expect(px(12.345)).toBe('12.3')
  })

  it('distinguishes gap, touch and overlap on one axis', () => {
    expect(axis(0, 10, 15, 20)).toEqual({ kind: 'gap', distance: 5 })
    expect(axis(0, 10, 10.2, 20)).toEqual({ kind: 'touch' })
    expect(axis(0, 10, 6, 20)).toEqual({ kind: 'overlap', distance: 4 })
    expect(axis(15, 20, 0, 10)).toEqual({ kind: 'gap', distance: 5 })
  })

  it('marks diagonal pairs and draws no single gap for them', () => {
    const a = r(0, 0, 10, 10)
    const b = r(30, 40, 10, 10)
    const rel = relate(a, b)
    expect(rel.diagonal).toBe(true)
    expect(horizontalGuide(a, b)).toBeNull()
    expect(verticalGuide(a, b)).toBeNull()
  })

  it('places a gap guide in the shared span', () => {
    expect(horizontalGuide(r(0, 0, 10, 20), r(30, 10, 10, 20))).toEqual({ x1: 10, y1: 15, x2: 30, y2: 15, value: 20 })
    expect(verticalGuide(r(0, 0, 20, 10), r(10, 25, 20, 10))).toEqual({ x1: 15, y1: 10, x2: 15, y2: 25, value: 15 })
  })

  it('computes overlap and direction from A to B', () => {
    const a = r(0, 0, 50, 50)
    const b = r(40, 10, 30, 80)
    expect(intersection(a, b)).toEqual(r(40, 10, 10, 40))
    const rel = relate(a, b)
    expect(rel.overlap).not.toBeNull()
    expect(rel.delta.height).toBe(30)
    expect(relate(b, a).delta.height).toBe(-30)
  })

  it('unions and measures successive gaps', () => {
    expect(union([r(0, 0, 10, 10), r(20, 5, 10, 10)])).toEqual(r(0, 0, 30, 15))
    expect(gaps([r(40, 0, 10, 10), r(0, 0, 10, 10), r(18, 0, 10, 10)], 'horizontal')).toEqual([8, 12])
  })
})

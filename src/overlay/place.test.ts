// src/overlay/place.test.ts
import { describe, expect, it } from 'vitest'
import { place } from './place'

const vp = { width: 800, height: 600 }

describe('place', () => {
  it('puts the box below the anchor when it fits', () => {
    expect(place({ x: 100, y: 100, width: 50, height: 20 }, { width: 200, height: 40 }, vp)).toEqual({ x: 100, y: 128, width: 200, height: 40 })
  })

  it('flips above near the bottom edge and slides inside horizontally', () => {
    const box = place({ x: 700, y: 560, width: 50, height: 20 }, { width: 200, height: 40 }, vp)
    expect(box).toEqual({ x: 592, y: 512, width: 200, height: 40 })
  })

  it('skips a side that would cover an avoided surface', () => {
    const dock = { x: 0, y: 120, width: 800, height: 60 }
    const box = place({ x: 100, y: 100, width: 50, height: 20 }, { width: 200, height: 40 }, vp, ['below', 'above'], [dock])
    expect(box.y).toBe(52)
  })

  it('stays inside the viewport for an anchor larger than the viewport', () => {
    const box = place({ x: -50, y: -50, width: 1000, height: 1000 }, { width: 200, height: 40 }, vp)
    expect(box.x).toBeGreaterThanOrEqual(8)
    expect(box.y + box.height).toBeLessThanOrEqual(592)
  })
})

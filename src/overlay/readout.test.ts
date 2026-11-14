// src/overlay/readout.test.ts
import { describe, expect, it } from 'vitest'
import { family, hex, shorthand } from './readout'

describe('readout values', () => {
  it('writes four sides as the shortest CSS shorthand', () => {
    expect(shorthand({ top: 8, right: 8, bottom: 8, left: 8 })).toBe('8')
    expect(shorthand({ top: 8, right: 14, bottom: 8, left: 14 })).toBe('8 14')
    expect(shorthand({ top: 4, right: 14, bottom: 8, left: 14 })).toBe('4 14 8')
    expect(shorthand({ top: 1, right: 2, bottom: 3, left: 4.25 })).toBe('1 2 3 4.3')
  })

  it('turns computed colours into short hex', () => {
    expect(hex('rgb(239, 233, 242)')).toBe('#efe9f2')
    expect(hex('rgba(0, 0, 0, 0)')).toBe('transparent')
    expect(hex('rgba(255, 0, 0, 0.5)')).toBe('#ff000080')
    expect(hex('color(srgb 1 0 0)')).toBe('color(srgb 1 0 0)')
  })

  it('names the first typeface only, without quotes', () => {
    expect(family('"Segoe UI", system-ui, sans-serif')).toBe('Segoe UI')
    expect(family('Arial')).toBe('Arial')
  })
})

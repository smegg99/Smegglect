// src/overlay/button.test.ts
import { describe, expect, it } from 'vitest'
import { buttonCentre, nearestSpot, unfold } from './button'

const desk = { width: 1280, height: 800 }
const phone = { width: 375, height: 667 }

describe('nearestSpot', () => {
  it('takes the nearest edge and the share of its length', () => {
    expect(nearestSpot({ x: 640, y: 790 }, desk)).toEqual({ placement: 'bottom', offset: 0.5 })
    expect(nearestSpot({ x: 320, y: 5 }, desk)).toEqual({ placement: 'top', offset: 0.25 })
    expect(nearestSpot({ x: 3, y: 200 }, desk)).toEqual({ placement: 'left', offset: 0.25 })
    expect(nearestSpot({ x: 1279, y: 600 }, desk)).toEqual({ placement: 'right', offset: 0.75 })
  })

  it('keeps the share inside the edge when the pointer leaves the viewport', () => {
    expect(nearestSpot({ x: -40, y: 900 }, desk)).toEqual({ placement: 'bottom', offset: 0 })
  })
})

describe('buttonCentre', () => {
  it('sits 12 px from its edge and stays whole at the ends', () => {
    expect(buttonCentre({ placement: 'bottom', offset: 0.5 }, desk, 40)).toEqual({ x: 640, y: 768 })
    expect(buttonCentre({ placement: 'top', offset: 0 }, desk, 40)).toEqual({ x: 32, y: 32 })
    expect(buttonCentre({ placement: 'right', offset: 1 }, desk, 40)).toEqual({ x: 1248, y: 768 })
  })
})

describe('unfold', () => {
  it('anchors at the button so the tools grow toward the larger side', () => {
    const left = unfold({ placement: 'bottom', offset: 0.2 }, desk, 40)
    expect(left).toEqual({ vertical: false, reversed: false, style: { left: '236px', bottom: '12px', maxWidth: '1032px' } })
    const right = unfold({ placement: 'bottom', offset: 0.8 }, desk, 40)
    expect(right).toEqual({ vertical: false, reversed: true, style: { right: '236px', bottom: '12px', maxWidth: '1032px' } })
  })

  it('puts the button where it was collapsed, whatever the tools need', () => {
    const size = 40
    for (const offset of [0, 0.3, 0.5, 0.9, 1]) {
      const c = buttonCentre({ placement: 'bottom', offset }, phone, size)
      const { style, reversed } = unfold({ placement: 'bottom', offset }, phone, size)
      const near = reversed ? phone.width - Number.parseFloat(style.right!) : Number.parseFloat(style.left!)
      expect(Math.abs(near - (reversed ? c.x + size / 2 : c.x - size / 2))).toBeLessThanOrEqual(0.5)
    }
  })

  it('runs down or up a side edge', () => {
    expect(unfold({ placement: 'left', offset: 0.1 }, desk, 40)).toEqual({ vertical: true, reversed: false, style: { top: '60px', left: '12px', maxHeight: '728px' } })
    expect(unfold({ placement: 'right', offset: 0.9 }, desk, 40)).toEqual({ vertical: true, reversed: true, style: { bottom: '60px', right: '12px', maxHeight: '728px' } })
  })
})

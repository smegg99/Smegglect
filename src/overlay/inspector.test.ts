// src/overlay/inspector.test.ts
import { describe, expect, it } from 'vitest'
import { INSPECTOR_WIDTH, panelLayout, type DockSpot } from './inspector'

const desk = { width: 1280, height: 800 }
const phone = { width: 360, height: 640 }
const dock = (placement: DockSpot['placement'], x: number, y: number, width: number, height: number, reversed = false) =>
  ({ box: { x, y, width, height }, placement, reversed })

describe('panelLayout', () => {
  it('on the bottom edge the drawer is as wide as the toolbar and opens just above it', () => {
    expect(panelLayout(desk, dock('bottom', 430, 744, 420, 44))).toEqual({
      edge: 'bottom', box: { x: 430, y: 256, width: 420, height: 480 },
    })
  })

  it('on the top edge it opens just below the toolbar', () => {
    expect(panelLayout(desk, dock('top', 700, 12, 420, 44))).toEqual({
      edge: 'top', box: { x: 700, y: 64, width: 420, height: 480 },
    })
  })

  it('a toolbar narrower than the panel gets a drawer of the panel\'s width, centred on it and on screen', () => {
    expect(panelLayout(desk, dock('bottom', 540, 744, 200, 44)).box).toEqual({ x: 448, y: 256, width: INSPECTOR_WIDTH, height: 480 })
    expect(panelLayout(desk, dock('bottom', 1060, 744, 200, 44)).box.x).toBe(1280 - 8 - INSPECTOR_WIDTH)
  })

  it('beside a side toolbar it starts where the toolbar starts, as long as it and no shorter than its reach', () => {
    expect(panelLayout(desk, dock('right', 1220, 200, 48, 400))).toEqual({
      edge: 'right', box: { x: 1220 - 8 - INSPECTOR_WIDTH, y: 200, width: INSPECTOR_WIDTH, height: 480 },
    })
    // Grown upwards from a button low on the edge, it ends where the toolbar ends.
    expect(panelLayout(desk, dock('left', 12, 300, 48, 400, true))).toEqual({
      edge: 'left', box: { x: 68, y: 220, width: INSPECTOR_WIDTH, height: 480 },
    })
    expect(panelLayout(desk, dock('right', 1220, 40, 48, 700)).box).toMatchObject({ y: 40, height: 700 })
    // Kept on screen when the toolbar starts too low for it.
    expect(panelLayout(desk, dock('right', 1220, 500, 48, 280)).box).toMatchObject({ y: 800 - 8 - 480, height: 480 })
  })

  it('on a phone the drawer reaches less far and never wider than the screen', () => {
    expect(panelLayout(phone, dock('bottom', 8, 540, 344, 88))).toEqual({
      edge: 'bottom', box: { x: 8, y: 244, width: 344, height: 288 },
    })
  })

  it('never runs past the room between the toolbar and the far edge', () => {
    expect(panelLayout({ width: 1280, height: 300 }, dock('bottom', 430, 244, 420, 44)).box).toMatchObject({ y: 8, height: 228 })
  })

  it('before the toolbar is measured it opens from the middle of the bottom edge', () => {
    expect(panelLayout(desk, null)).toEqual({ edge: 'bottom', box: { x: 448, y: 304, width: INSPECTOR_WIDTH, height: 480 } })
  })
})

// src/overlay/inspector.test.ts
import { describe, expect, it } from 'vitest'
import { INSPECTOR_WIDTH, panelLayout, sideFor } from './inspector'

const desk = { width: 1280, height: 800 }
const phone = { width: 360, height: 640 }
const at = (x: number, y: number) => ({ x, y, width: 40, height: 20 })

describe('panelLayout', () => {
  it('sits on the chosen side at full height with 8 px margins', () => {
    expect(panelLayout(desk, 'right', { wide: false, selection: null, peek: false, head: 40 })).toEqual({ kind: 'side', edge: 'right', box: { x: 912, y: 8, width: INSPECTOR_WIDTH, height: 784 } })
    expect(panelLayout(desk, 'left', { wide: false, selection: null, peek: false, head: 40 }).box.x).toBe(8)
  })

  it('ends above a bottom dock it would cover, and leaves the dock where it is', () => {
    const dock = { box: { x: 302, y: 712, width: 420, height: 44 }, placement: 'bottom' as const }
    const wide = panelLayout({ width: 1024, height: 768 }, 'right', { wide: true, selection: null, peek: false, head: 40, dock })
    expect(wide.box).toEqual({ x: 296, y: 8, width: 720, height: 696 })
    const clear = panelLayout(desk, 'right', { wide: false, selection: null, peek: false, head: 40, dock: { box: { x: 430, y: 744, width: 420, height: 44 }, placement: 'bottom' } })
    expect(clear.box.height).toBe(784)
  })

  it('sits beside a side dock on its own edge and below a top dock', () => {
    const right = panelLayout(desk, 'right', { wide: false, selection: null, peek: false, head: 40, dock: { box: { x: 1220, y: 200, width: 48, height: 400 }, placement: 'right' } })
    expect(right.box.x + right.box.width).toBe(1212)
    const top = panelLayout(desk, 'right', { wide: false, selection: null, peek: false, head: 40, dock: { box: { x: 700, y: 12, width: 420, height: 44 }, placement: 'top' } })
    expect(top.box.y).toBe(64)
  })

  it('widens for the report, within the viewport', () => {
    expect(panelLayout(desk, 'right', { wide: true, selection: null, peek: false, head: 40 }).box.width).toBe(720)
    expect(panelLayout({ width: 730, height: 600 }, 'right', { wide: true, selection: null, peek: false, head: 40 }).box.width).toBe(714)
  })

  it('becomes a sheet on the edge away from the selection below 720 px', () => {
    const low = panelLayout(phone, 'right', { wide: false, selection: at(20, 100), peek: false, head: 40 })
    expect(low.kind).toBe('sheet')
    expect(low.edge).toBe('bottom')
    expect(low.box.height).toBeLessThanOrEqual(352)
    expect(low.box.y + low.box.height).toBe(632)
    const high = panelLayout(phone, 'right', { wide: false, selection: at(20, 500), peek: false, head: 40 })
    expect(high.edge).toBe('top')
    expect(high.box.y).toBe(8)
  })

  it('fits the sheet into the free space beside a selection in the middle of the screen', () => {
    const mid = panelLayout(phone, 'right', { wide: false, selection: { x: 20, y: 300, width: 80, height: 40 }, peek: false, head: 40 })
    expect(mid.box.y).toBeGreaterThanOrEqual(340)
    expect(mid.box.y + mid.box.height).toBe(632)
    const tall = panelLayout(phone, 'right', { wide: false, selection: { x: 20, y: 100, width: 80, height: 480 }, peek: false, head: 40 })
    expect(tall.box.height).toBe(160)
  })

  it('shrinks to its header while the page is being clicked, as a sheet and at the side', () => {
    expect(panelLayout(phone, 'right', { wide: false, selection: null, peek: true, head: 40 }).box.height).toBe(40)
    expect(panelLayout(desk, 'right', { wide: false, selection: null, peek: true, head: 40 }).box).toEqual({ x: 912, y: 8, width: INSPECTOR_WIDTH, height: 40 })
  })
})

describe('sideFor', () => {
  it('moves to the other side only when the selection is under the panel', () => {
    expect(sideFor('right', at(1000, 100), desk)).toBe('left')
    expect(sideFor('right', at(100, 100), desk)).toBe('right')
    expect(sideFor('left', at(100, 100), desk)).toBe('right')
    expect(sideFor('right', null, desk)).toBe('right')
  })

  it('stays when the selection would be covered on both sides', () => {
    expect(sideFor('right', { x: 0, y: 0, width: 1280, height: 50 }, desk)).toBe('right')
  })
})

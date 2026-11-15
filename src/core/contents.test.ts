// src/core/contents.test.ts
import { describe, expect, it } from 'vitest'
import { selectContents, type Placed } from './contents'
import type { Rect } from './model'

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })
const place = (item: string, r: Rect, parent: string | null = null): Placed<string> => ({ item, rect: r, parent })
const control = (item: string, r: Rect, parent: string | null = null): Placed<string> => ({ ...place(item, r, parent), atomic: true })

describe('selectContents', () => {
  it('inside lists what lies fully within the region', () => {
    const placed = [
      place('a', rect(10, 10, 50, 50)),
      place('b', rect(70, 10, 50, 50)),
      place('c', rect(130, 10, 50, 50)),
    ]
    expect(selectContents(placed, rect(0, 0, 150, 100), 'inside', 64)).toEqual({ items: ['a', 'b'], total: 2 })
  })

  it('touching lists what the region meets, but not what holds all of it', () => {
    const placed = [
      place('card', rect(0, 0, 400, 200)),
      place('a', rect(20, 20, 100, 100), 'card'),
      place('b', rect(140, 20, 100, 100), 'card'),
      place('c', rect(260, 20, 100, 100), 'card'),
    ]
    const region = rect(100, 50, 60, 20)
    expect(selectContents(placed, region, 'touching', 64)).toEqual({ items: ['a', 'b'], total: 2 })
  })

  it('only the outermost of a nested match is kept', () => {
    const placed = [
      place('card', rect(10, 10, 200, 100)),
      place('title', rect(20, 20, 80, 20), 'card'),
      place('text', rect(20, 50, 80, 20), 'card'),
    ]
    expect(selectContents(placed, rect(0, 0, 300, 200), 'inside', 64)).toEqual({ items: ['card'], total: 1 })
    expect(selectContents(placed, rect(0, 0, 300, 200), 'touching', 64)).toEqual({ items: ['card'], total: 1 })
  })

  it('touching looks into a crossed container that holds several touched things', () => {
    const placed = [
      place('toolbar', rect(0, 0, 600, 64)),
      place('row', rect(0, 0, 600, 64), 'toolbar'),
      control('save', rect(20, 14, 80, 36), 'row'),
      control('cancel', rect(110, 14, 80, 36), 'row'),
    ]
    // Over both buttons and 6 px past the bar's bottom edge.
    expect(selectContents(placed, rect(10, 10, 190, 60), 'touching', 64)).toEqual({ items: ['save', 'cancel'], total: 2 })
  })

  it('touching keeps a crossed container that holds one touched thing', () => {
    const placed = [place('card', rect(0, 0, 300, 200)), place('title', rect(10, 10, 200, 30), 'card')]
    expect(selectContents(placed, rect(150, 5, 200, 20), 'touching', 64)).toEqual({ items: ['card'], total: 1 })
  })

  it('a control counts as one thing in both modes, never as its parts', () => {
    const placed = [
      control('button', rect(0, 0, 100, 40)),
      place('icon', rect(5, 5, 20, 20), 'button'),
      place('label', rect(30, 5, 60, 20), 'button'),
    ]
    expect(selectContents(placed, rect(2, 2, 150, 30), 'touching', 64)).toEqual({ items: ['button'], total: 1 })
    expect(selectContents(placed, rect(0, 0, 50, 40), 'inside', 64)).toEqual({ items: [], total: 0 })
  })

  it('an element the person cannot see gives way to what it holds', () => {
    const placed = [place('cover', rect(0, 0, 100, 100)), place('inner', rect(10, 10, 20, 20), 'cover')]
    const seen = (item: string) => item !== 'cover'
    expect(selectContents(placed, rect(0, 0, 200, 200), 'inside', 64, seen)).toEqual({ items: ['inner'], total: 1 })
  })

  it('a capped list keeps its count', () => {
    const placed = Array.from({ length: 70 }, (_, i) => place(`box${i}`, rect(i * 10, 0, 8, 8)))
    const { items, total } = selectContents(placed, rect(0, 0, 1000, 20), 'inside', 64)
    expect(total).toBe(70)
    expect(items).toHaveLength(64)
    expect(items[0]).toBe('box0')
    expect(items[63]).toBe('box63')
  })

  it('nothing found is an empty list', () => {
    const placed = [place('page', rect(0, 0, 1000, 1000)), place('a', rect(500, 500, 10, 10), 'page')]
    expect(selectContents(placed, rect(10, 10, 50, 50), 'touching', 64)).toEqual({ items: [], total: 0 })
    expect(selectContents(placed, rect(10, 10, 50, 50), 'inside', 64)).toEqual({ items: [], total: 0 })
  })
})

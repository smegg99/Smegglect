// tests/e2e/region-contents.spec.ts
// A region names the elements in it, CAD-style: dragged left to right it lists the elements fully inside,
// right to left the ones it touches. The agent gets them with their descriptions, bounds and sources.
import { expect, test, type Page } from '@playwright/test'
import type { ContentsMode, Rect } from '../../src/core/model'
import { ui } from './helpers'

const boxOf = (page: Page, selector: string) => page.locator(selector).evaluate((element) => {
  const rect = element.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
})

const around = (rects: Rect[], pad: number): Rect => {
  const x = Math.min(...rects.map(rect => rect.x)) - pad
  const y = Math.min(...rects.map(rect => rect.y)) - pad
  const right = Math.max(...rects.map(rect => rect.x + rect.width)) + pad
  const bottom = Math.max(...rects.map(rect => rect.y + rect.height)) + pad
  return { x, y, width: right - x, height: bottom - y }
}

/** Draws a region in viewport coordinates and records a note on it; returns the note's contents. */
async function noteOn(page: Page, rect: Rect, mode: ContentsMode) {
  return page.evaluate(async ([region, how]) => {
    const engine = window.sg!.engine
    engine.toggleRegion()
    engine.regionStart({ x: region.x, y: region.y })
    engine.regionEnd(region, how)
    await engine.apply('note', {}, 'Look here')
    return engine.state().drafts.issues.at(-1)!.evidence.a.contents
  }, [rect, mode] as const)
}

const ids = (contents: { elements: { element: { id?: string } }[] } | undefined) => {
  return contents?.elements.map(listed => listed.element.id)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/plain.html?open&memory')
})

test('inside lists the boxes the region covers, with their bounds', async ({ page }) => {
  const a = await boxOf(page, '#box-a')
  const b = await boxOf(page, '#box-b')
  const contents = await noteOn(page, around([a, b], 4), 'inside')
  expect(contents?.mode).toBe('inside')
  expect(ids(contents)).toEqual(['box-a', 'box-b'])
  expect(contents?.total).toBe(2)
  expect(contents?.elements[0]?.bounds.width).toBeCloseTo(a.width, 1)
  expect(contents?.elements[0]?.source.quality).toBeDefined()
})

test('touching lists what it meets, not the card around it', async ({ page }) => {
  const a = await boxOf(page, '#box-a')
  const b = await boxOf(page, '#box-b')
  // From inside A, across the gap, into B: inside their card, holding neither whole.
  const x = a.x + a.width - 10
  const rect = { x, y: a.y + 10, width: b.x + 10 - x, height: 10 }
  const contents = await noteOn(page, rect, 'touching')
  expect(contents?.mode).toBe('touching')
  expect(ids(contents)).toEqual(['box-a', 'box-b'])
})

test("the overlay's own toolbar is never listed, nor the page itself", async ({ page }) => {
  const viewport = page.viewportSize()!
  const all = { x: 0, y: 0, width: viewport.width, height: viewport.height }
  for (const mode of ['inside', 'touching'] as const) {
    const contents = await noteOn(page, all, mode)
    const tags = contents?.elements.map(listed => listed.element.tag) ?? []
    expect(tags.length).toBeGreaterThan(0)
    expect(tags).not.toContain('smegglect-root')
    expect(tags).not.toContain('body')
    expect(tags).not.toContain('html')
    const paths = contents?.elements.flatMap(listed => listed.element.path) ?? []
    expect(paths.some(step => step.includes('smegglect'))).toBe(false)
    // Nothing from inside the overlay's shadow root either.
    expect(contents?.elements.every(listed => listed.element.shadowDepth === 0)).toBe(true)
    expect(contents!.total).toBeGreaterThanOrEqual(contents!.elements.length)
  }
})

test('a region drawn after scrolling lists what is under it', async ({ page }) => {
  await page.evaluate(() => {
    document.body.style.minHeight = '3000px'
    // Less than A's height, so A stays on screen and a mix-up of the two frames misses it.
    window.scrollTo(0, 50)
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(50)
  const a = await boxOf(page, '#box-a')
  const contents = await noteOn(page, around([a], 2), 'inside')
  expect(ids(contents)).toEqual(['box-a'])
})

test('an element in an open shadow root is listed', async ({ page }) => {
  await page.evaluate(() => {
    const host = Object.assign(document.createElement('div'), { id: 'shadow-host' })
    host.style.cssText = 'position: fixed; left: 600px; top: 500px; width: 100px; height: 80px'
    const inner = Object.assign(document.createElement('span'), { id: 'in-shadow', textContent: 'S' })
    inner.style.cssText = 'display: block; margin: 20px; width: 60px; height: 40px'
    host.attachShadow({ mode: 'open' }).append(inner)
    document.body.append(host)
  })
  const inner = { x: 620, y: 520, width: 60, height: 40 }
  const contents = await noteOn(page, around([inner], 4), 'inside')
  expect(ids(contents)).toEqual(['in-shadow'])
  expect(contents?.elements[0]?.element.shadowDepth).toBe(1)
})

test('elements without a box of their own are looked through, and hidden ones are not listed', async ({ page }) => {
  await page.evaluate(() => {
    const walk = document.createElement('div')
    walk.style.cssText = 'position: fixed; left: 400px; top: 480px; width: 360px; height: 120px'
    walk.innerHTML = [
      '<div style="display: contents">',
      '<span id="wc-1" style="display: inline-block; width: 40px; height: 20px; margin: 10px"></span>',
      '<span id="wc-2" style="display: inline-block; width: 40px; height: 20px; margin: 10px"></span>',
      '</div>',
      '<div id="w-none" style="display: none; width: 40px; height: 20px"></div>',
      '<div style="height: 0"><span id="w-abs" style="position: absolute; display: block; left: 200px; top: 60px; width: 40px; height: 20px"></span></div>',
    ].join('')
    document.body.append(walk)
  })
  const boxes = await Promise.all(['#wc-1', '#wc-2', '#w-abs'].map(selector => boxOf(page, selector)))
  const contents = await noteOn(page, around(boxes, 4), 'inside')
  expect(ids(contents)).toEqual(['wc-1', 'wc-2', 'w-abs'])
  expect(contents?.total).toBe(3)
})

test('what is covered or invisible is not listed; what covers it is', async ({ page }) => {
  await page.evaluate(() => {
    const add = (id: string, css: string) => {
      const element = Object.assign(document.createElement('div'), { id })
      element.style.cssText = `position: fixed; ${css}`
      document.body.append(element)
    }
    add('under', 'left: 600px; top: 500px; width: 60px; height: 40px; background: #ccc')
    add('cover', 'left: 590px; top: 490px; width: 80px; height: 60px; background: #333; z-index: 10')
    add('tip', 'left: 700px; top: 500px; width: 40px; height: 20px; visibility: hidden')
    add('faded', 'left: 760px; top: 500px; width: 40px; height: 20px; opacity: 0')
  })
  const contents = await noteOn(page, { x: 580, y: 480, width: 240, height: 80 }, 'inside')
  expect(ids(contents)).toEqual(['cover'])
})

test('a box inside one element in touching mode finds nothing and stores no contents', async ({ page }) => {
  const a = await boxOf(page, '#box-a')
  const contents = await noteOn(page, { x: a.x + 10, y: a.y + 10, width: 20, height: 10 }, 'touching')
  expect(contents).toBeUndefined()
})

/** Drags with the mouse in region mode from one corner to the other; `hold` runs before the button is let go. */
async function drag(page: Page, from: { x: number, y: number }, to: { x: number, y: number }, hold?: () => Promise<void>) {
  await page.evaluate(() => window.sg!.engine.toggleRegion())
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  if (hold) await hold()
  await page.mouse.up()
}

test('the box is solid and says Inside while dragging right, dashed and says Touching while dragging left', async ({ page }) => {
  const a = await boxOf(page, '#box-a')
  const b = await boxOf(page, '#box-b')
  const region = around([a, b], 4)
  const left = { x: region.x, y: region.y }
  const right = { x: region.x + region.width, y: region.y + region.height }
  const drafting = ui(page, '.guides .box.region.draft')
  const label = ui(page, '.measure-label.region-mode')
  await drag(page, left, right, async () => {
    await expect(drafting).toHaveClass(/\binside\b/)
    await expect(label).toHaveText('Inside')
  })
  await expect(label).toHaveCount(0)
  await drag(page, right, left, async () => {
    await expect(drafting).toHaveClass(/\btouching\b/)
    await expect(label).toHaveText('Touching')
  })
  await expect(label).toHaveCount(0)
})

test('a slotted element is held by the shadow wrapper it shows in, so only the wrapper is listed', async ({ page }) => {
  await page.evaluate(() => {
    const host = Object.assign(document.createElement('div'), { id: 'slot-host' })
    host.style.cssText = 'position: fixed; left: 600px; top: 500px; width: 120px; height: 90px'
    const wrapper = Object.assign(document.createElement('div'), { id: 'slot-wrapper' })
    wrapper.style.cssText = 'margin: 10px; width: 100px; height: 70px'
    wrapper.append(document.createElement('slot'))
    host.attachShadow({ mode: 'open' }).append(wrapper)
    const slotted = Object.assign(document.createElement('span'), { id: 'slotted', textContent: 'S' })
    slotted.style.cssText = 'display: block; margin: 10px; width: 40px; height: 30px'
    host.append(slotted)
    document.body.append(host)
  })
  const wrapper = { x: 610, y: 510, width: 100, height: 70 }
  expect(ids(await noteOn(page, around([wrapper], 4), 'inside'))).toEqual(['slot-wrapper'])
})

test('the panel\'s count drops as listed elements leave the page, as the issue\'s does', async ({ page }) => {
  const region = around([await boxOf(page, '#box-a'), await boxOf(page, '#box-b')], 4)
  const dims = ui(page, '.inspector .target .dims')
  await drag(page, { x: region.x, y: region.y }, { x: region.x + region.width, y: region.y + region.height })
  await expect(dims).toHaveText(/, 2 elements inside$/)
  await page.evaluate(() => document.getElementById('box-b')!.remove())
  await expect(dims).toHaveText(/, 1 element inside$/)
  const total = await page.evaluate(async () => {
    await window.sg!.engine.apply('note', {}, 'Look here')
    return window.sg!.engine.state().drafts.issues.at(-1)!.evidence.a.contents?.total
  })
  expect(total).toBe(1)
})

test('the panel says how many elements the region holds', async ({ page }) => {
  const a = await boxOf(page, '#box-a')
  const b = await boxOf(page, '#box-b')
  const region = around([a, b], 4)
  const left = { x: region.x, y: region.y }
  const right = { x: region.x + region.width, y: region.y + region.height }
  const dims = ui(page, '.inspector .target .dims')
  await drag(page, left, right)
  await expect(dims).toHaveText(/^[\d.]+ x [\d.]+, 2 elements inside$/)
  await expect(ui(page, '.guides .box.region.inside:not(.draft)')).toHaveCount(1)
  await drag(page, right, left)
  await expect(dims).toHaveText(/^[\d.]+ x [\d.]+, 2 elements touching$/)
  await expect(ui(page, '.guides .box.region.touching:not(.draft)')).toHaveCount(1)
})

test('the mode label stays on screen for a region drawn from the top edge', async ({ page }) => {
  const label = ui(page, '.measure-label.region-mode')
  await drag(page, { x: 300, y: 2 }, { x: 600, y: 120 }, async () => {
    await expect(label).toHaveText('Inside')
    const box = (await label.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
  })
})

test('a drag that finds nothing says so and keeps the look of its mode', async ({ page }) => {
  await drag(page, { x: 900, y: 520 }, { x: 1200, y: 640 })
  await expect(ui(page, '.inspector .target .dims')).toHaveText(/^[\d.]+ x [\d.]+, 0 elements inside$/)
  await expect(ui(page, '.guides .box.region.inside:not(.draft)')).toHaveCount(1)
})

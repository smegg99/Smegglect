// tests/e2e/measure.spec.ts
// M01-M05: rendered bounds in CSS pixels, transforms, DPR, pairwise direction, live updates.
import { expect, test, type Page } from '@playwright/test'
import { instrument, owned, preset, settle, tile, ui } from './helpers'

const TOLERANCE = 0.01

async function pick(page: Page, selector: string, opts: { shift?: boolean } = {}) {
  const key = ui(page, '.dock [aria-label="Pick element"]')
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click()
  await page.locator(selector).click(opts.shift ? { modifiers: ['Shift'] } : {})
  await settle(page)
}

async function guideA(page: Page) {
  return page.evaluate(() => {
    const r = document.querySelector('smegglect-root')!.shadowRoot!.querySelector('.guides .a')!
    return { x: +r.getAttribute('x')!, y: +r.getAttribute('y')!, width: +r.getAttribute('width')!, height: +r.getAttribute('height')! }
  })
}

async function bounds(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
}

function close(a: Record<string, number>, b: Record<string, number>) {
  for (const k of Object.keys(b)) expect(Math.abs((a[k] ?? NaN) - (b[k] ?? NaN)), k).toBeLessThanOrEqual(TOLERANCE)
}

test('M01 guides equal rendered bounds, through window scroll', async ({ page }) => {
  await page.goto('/plain.html?open')
  await pick(page, '#box-a')
  close(await guideA(page), await bounds(page, '#box-a'))
  expect(await ui(page, '.inspector .target .dims').textContent()).toBe('124.5 x 44')
  await page.setViewportSize({ width: 900, height: 300 })
  await page.evaluate(() => window.scrollTo(0, 40))
  await settle(page)
  close(await guideA(page), await bounds(page, '#box-a'))
})

test('M02 transforms are rendered bounds and DPR 2 is not double scaled', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto('/plain.html?open')
  await pick(page, '#box-c')
  close(await guideA(page), await bounds(page, '#box-c'))
  await preset(page, 'size', { choice: 'Too wide' })
  const ev = await page.evaluate(() => window.sg!.engine.state().drafts.issues[0]!.evidence)
  expect(ev.a.transformed).toBe(true)
  expect(ev.capture.devicePixelRatio).toBe(2)
  expect(ev.a.bounds.width).toBeGreaterThan(80)
  await context.close()
})

test('M03 M04 match height keeps A as target and B as reference with exact deltas', async ({ page }) => {
  await page.goto('/plain.html?open')
  await pick(page, '#box-a')
  await tile(page, 'match-height').click()
  await expect(ui(page, '.inspector .waiting')).toContainText('Pick B')
  await page.locator('#box-b').hover()
  await settle(page)
  // Only height guides: two extents, no gap line.
  expect(await page.locator('smegglect-root .guides line.dist').count()).toBe(2)
  await page.locator('#box-b').click()
  await expect(ui(page, '.inspector .form .cmp')).toContainText('height')
  await ui(page, '.inspector .form .key.primary').click()
  const issue = await page.evaluate(() => window.sg!.engine.state().drafts.issues[0]!)
  const a = await bounds(page, '#box-a')
  const b = await bounds(page, '#box-b')
  expect(issue.operands.a.kind === 'dom' && issue.operands.a.element.label).toBe('A')
  expect(issue.operands.b?.kind === 'dom' && issue.operands.b.element.label).toBe('B')
  expect(issue.evidence.relation!.delta.height).toBeCloseTo(b.height - a.height, 5)
  expect(issue.evidence.relation!.horizontal).toEqual({ kind: 'gap', distance: b.x - (a.x + a.width) })
  expect(issue.evidence.a.bounds.width).toBe(124.5)
})

test('M04 edge alignment draws the reference edge and records the offset', async ({ page }) => {
  await page.goto('/plain.html?open')
  await pick(page, '#box-c')
  await preset(page, 'align', { b: '#box-a', choice: 'Top edges' })
  const issue = await page.evaluate(() => window.sg!.engine.state().drafts.issues[0]!)
  expect(issue.intent).toMatchObject({ preset: { id: 'align' }, params: { edge: 'top' } })
  const a = await bounds(page, '#box-c')
  const b = await bounds(page, '#box-a')
  expect(issue.evidence.relation!.delta.top).toBeCloseTo(b.y - a.y, 5)
})

test('M03 overlap and diagonal pairs are labelled distinctly', async ({ page }) => {
  await page.goto('/plain.html?open')
  await page.evaluate(() => {
    const host = document.querySelector('.boxes')!
    host.insertAdjacentHTML('beforeend', '<div id="ov1" style="position:absolute;left:600px;top:500px;width:60px;height:40px;background:#cde"></div><div id="ov2" style="position:absolute;left:640px;top:520px;width:60px;height:40px;background:#edc"></div><div id="dg" style="position:absolute;left:760px;top:700px;width:30px;height:30px;background:#dce"></div>')
  })
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await pick(page, '#ov1')
  // The strip sits below #ov1 over part of #ov2; move to the uncovered corner.
  await page.mouse.move(690, 524)
  await settle(page)
  expect(await ui(page, '.measure-label.over').textContent()).toBe('20 x 20')
  await page.mouse.move(775, 715)
  await settle(page)
  const labels = await page.locator('smegglect-root .measure-label.dist').allTextContents()
  expect(labels).toEqual(expect.arrayContaining(['dx 100', 'dy 160']))
})

test('M05 nested scroll, resize and animation update guides; hiding measurements stops sampling', async ({ page }) => {
  await instrument(page)
  await page.goto('/boundaries.html')
  await pick(page, '#deep')
  close(await guideA(page), await bounds(page, '#deep'))
  await page.locator('#scroller').evaluate(el => (el.scrollTop = 70))
  await settle(page)
  close(await guideA(page), await bounds(page, '#deep'))
  await page.locator('#deep').evaluate(el => ((el as HTMLElement).style.width = '200px'))
  await settle(page)
  await settle(page)
  close(await guideA(page), await bounds(page, '#deep'))
  // A pick ends pick mode; without measurements nothing samples between events.
  await settle(page)
  expect((await owned(page)).frames).toBe(0)
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await page.locator('#deep').evaluate(el => el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(60px)' }], { duration: 400, fill: 'forwards' }))
  await page.waitForTimeout(450)
  await settle(page)
  close(await guideA(page), await bounds(page, '#deep'))
  expect((await owned(page)).frames).toBe(1)
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await settle(page)
  await settle(page)
  expect((await owned(page)).frames).toBe(0)
  expect(await page.locator('smegglect-root .guides line').count()).toBe(0)
})

test('readout reads box widths and composed containment through open shadow roots', async ({ page }) => {
  await page.goto('/plain.html?manual')
  const r = await page.evaluate(() => {
    const dom = window.smegglectDom as unknown as {
      readout: (el: Element) => { width: number, box: { border: Record<string, number>, padding: Record<string, number> } }
      composedContains: (outer: Element, inner: Element) => boolean
    }
    const host = document.createElement('div')
    document.body.append(host)
    const inner = document.createElement('span')
    host.attachShadow({ mode: 'open' }).append(inner)
    const a = document.getElementById('box-a')!
    const out = dom.readout(a)
    return {
      width: out.width,
      border: out.box.border,
      padding: out.box.padding,
      hostHasInner: dom.composedContains(host, inner),
      bodyHasInner: dom.composedContains(document.body, inner),
      innerHasHost: dom.composedContains(inner, host),
      self: dom.composedContains(a, a),
    }
  })
  expect(r.width).toBeCloseTo(124.5, 2)
  expect(r.border).toEqual({ top: 2, right: 2, bottom: 2, left: 2 })
  expect(r.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  expect(r.hostHasInner).toBe(true)
  expect(r.bodyHasInner).toBe(true)
  expect(r.innerHasHost).toBe(false)
  expect(r.self).toBe(false)
})

async function hover(page: Page, selector: string) {
  const b = (await page.locator(selector).boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 2 })
  await settle(page)
  await settle(page)
}

const hovered = (page: Page) => page.evaluate(() => window.sg!.engine.geometry().candidate)

test('M06 measure on with nothing selected reports the hovered box', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await hover(page, '#box-b')
  const c = await hovered(page)
  expect(c?.box?.border.top).toBe(2)
  expect(c?.relation).toBeUndefined()
  expect(Math.round(c!.rect.width)).toBe(100)
})

test('M07 measure in pass mode leaves host clicks alone', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await hover(page, '#cancel')
  await page.evaluate(() => window.events.splice(0))
  await page.locator('#cancel').click()
  expect(await page.evaluate(() => window.events)).toContain('click:cancel')
})

test('M08 hover relation to the selection is self, inside, contains or apart', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await ui(page, '.dock [aria-label="Pick element"]').click()
  await page.locator('#order-form').click({ position: { x: 6, y: 6 } })
  await hover(page, '#cancel')
  expect((await hovered(page))?.relation).toBe('inside')
  await pick(page, '#cancel')
  await page.mouse.move(30, 300)
  await hover(page, '#link')
  expect((await hovered(page))?.relation).toBe('apart')
  await hover(page, '#cancel')
  expect((await hovered(page))?.relation).toBe('self')
  const form = (await page.locator('#order-form').boundingBox())!
  await page.mouse.move(form.x + 6, form.y + form.height - 6)
  await settle(page)
  await settle(page)
  expect((await hovered(page))?.relation).toBe('contains')
})

test('M09 hovering a child of the selection shows inset distances, not an overlap', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await ui(page, '.dock [aria-label="Pick element"]').click()
  await page.locator('#order-form').click({ position: { x: 6, y: 6 } })
  await hover(page, '#cancel')
  await expect(ui(page, '.measure-label.over')).toHaveCount(0)
  expect(await ui(page, '.measure-label.dist').count()).toBeGreaterThanOrEqual(2)
})

test('M10 measuring with nothing selected draws the hovered box and its size', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await hover(page, '#cancel')
  await expect(ui(page, '.guides .cand')).toHaveCount(1)
  await expect(ui(page, '.measure-label').first()).toContainText('x')
})

test('review 6: measuring a still selection does no per-frame text work and stops when collapsed', async ({ page }) => {
  await instrument(page)
  await page.addInitScript(() => {
    const d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!
    let reads = 0
    Object.defineProperty(Node.prototype, 'textContent', { ...d, get() { reads++; return d.get!.call(this) } })
    ;(window as unknown as { reads: () => number }).reads = () => reads
  })
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await pick(page, '#cancel')
  await hover(page, '#submit')
  const before = await page.evaluate(() => (window as unknown as { reads: () => number }).reads())
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => (window as unknown as { reads: () => number }).reads())
  expect(after - before).toBeLessThan(10)
  await page.keyboard.press('Alt+Shift+S')
  await settle(page)
  await settle(page)
  expect((await owned(page)).frames).toBe(0)
})

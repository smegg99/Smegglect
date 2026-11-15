// tests/e2e/hidden.spec.ts
// An app's views, switched without a new URL. A view kept mounted but hidden (v-show, display: none) leaves its
// elements on the page without a box: their plates and the selection are not drawn while it is hidden, rather
// than at the page's top-left corner, and come back with the view. A region has no element: it belongs to the
// screen it was drawn on, which the host names with the `screen` option.
import { expect, test, type Page } from '@playwright/test'
import { pick, ui } from './helpers'

/** As an app switches views with v-show: the form stays mounted, under display: none. */
const showForm = (page: Page, shown: boolean) => page.locator('#order-form').evaluate((form, on) => {
  (form as HTMLElement).style.display = on ? '' : 'none'
}, shown)

const pins = (page: Page) => page.evaluate(() => window.sg!.engine.geometry().pins)

async function report(page: Page) {
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Rename it')
  await ui(page, '.inspector .compose .add').click()
  await expect(ui(page, '.plate')).toHaveCount(1)
}

test('a plate whose target is hidden is not drawn, says why, and comes back with its view', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await report(page)
  // Nothing selected: only the plate's own target tells the overlay that the view went away.
  await page.evaluate(() => window.sg!.engine.clear())
  await showForm(page, false)
  await expect(ui(page, '.plate')).toHaveCount(0)
  await expect.poll(() => pins(page)).toEqual([expect.objectContaining({ rect: null, status: 'hidden' })])
  await ui(page, '.dock [data-tool="issues"]').click()
  await expect(ui(page, '.inspector [data-tree="issues"]')).toContainText('Hidden on the page right now')
  await showForm(page, true)
  await expect(ui(page, '.plate')).toHaveCount(1)
  await expect.poll(async () => (await pins(page))[0]?.status).toBe('live')
})

test('a selection under display: none is not outlined at the corner, and is again when shown', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#customer')
  await expect(ui(page, '.guides .box.a')).toHaveCount(1)
  await showForm(page, false)
  await expect(ui(page, '.guides .box.a')).toHaveCount(0)
  expect(await page.evaluate(() => window.sg!.engine.geometry().a)).toBeNull()
  expect(await page.evaluate(() => window.sg!.engine.geometry().readout)).toBeNull()
  await showForm(page, true)
  await expect(ui(page, '.guides .box.a')).toHaveCount(1)
})

test('a region belongs to the screen it was drawn on: another view of the app does not show it', async ({ page }) => {
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  // As SmeggTuner: one URL and route, its own view state named as the screen.
  await page.evaluate(() => {
    const host = window as unknown as { view: string }
    host.view = 'tune'
    window.sg = window.smegglect.mount({ project: { id: 'playground' }, open: true, storage: 'memory', screen: () => host.view })
  })
  const switchTo = (view: string) => page.evaluate((next) => {
    (window as unknown as { view: string }).view = next
    document.body.append(Object.assign(document.createElement('div'), { className: `view-${next}` }))
  }, view)
  await page.evaluate(() => {
    const engine = window.sg!.engine
    engine.toggleRegion()
    engine.regionStart({ x: 40, y: 300 })
    engine.regionEnd({ x: 40, y: 300, width: 200, height: 80 }, 'inside')
  })
  await expect(ui(page, '.guides .box.region')).toHaveCount(1)
  await ui(page, '.inspector .compose textarea').fill('Empty area')
  await ui(page, '.inspector .compose .add').click()
  await expect(ui(page, '.plate')).toHaveCount(1)
  // The selection and the issue's outline.
  const boxes = await ui(page, '.guides .box.region').count()
  expect(boxes).toBeGreaterThan(0)

  await switchTo('settings')
  await expect(ui(page, '.plate')).toHaveCount(0)
  await expect(ui(page, '.guides .box.region')).toHaveCount(0)
  await expect.poll(async () => (await pins(page))[0]?.status).toBe('elsewhere')

  await switchTo('tune')
  await expect(ui(page, '.plate')).toHaveCount(1)
  await expect(ui(page, '.guides .box.region')).toHaveCount(boxes)
})

test('a target rendered again later gets its plate back, as a view that renders after a delay', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#clip')
  await ui(page, '.inspector .compose textarea').fill('Too long')
  await ui(page, '.inspector .compose .add').click()
  await expect(ui(page, '.plate')).toHaveCount(1)
  // The element goes, so the plate looks for it by its description and finds nothing for now.
  await page.evaluate(() => {
    const clip = document.querySelector('#clip')!
    const host = window as unknown as { parked: { html: string, parent: Element, next: Node | null } }
    host.parked = { html: clip.outerHTML, parent: clip.parentElement!, next: clip.nextSibling }
    clip.remove()
  })
  await expect(ui(page, '.plate')).toHaveCount(0)
  await expect.poll(async () => (await pins(page))[0]?.status).toBe('unavailable')
  // A new element like it is rendered: the plate finds it.
  await page.evaluate(() => {
    const { html, parent, next } = (window as unknown as { parked: { html: string, parent: Element, next: Node | null } }).parked
    const template = document.createElement('template')
    template.innerHTML = html
    parent.insertBefore(template.content, next)
  })
  await expect(ui(page, '.plate')).toHaveCount(1)
})

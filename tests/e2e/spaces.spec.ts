// tests/e2e/spaces.spec.ts
// While measuring, a padding, a margin or the gap between two elements is drawn under the pointer and picked
// by a click, and the Spacing issue names it; without measurements a click picks the element as before.
import { expect, test, type Page } from '@playwright/test'
import { ui } from './helpers'

async function pickWithMeasure(page: Page) {
  await page.goto('/plain.html?open&memory')
  await page.evaluate(() => window.sg!.engine.setMeasuring(true))
  await ui(page, '.dock [aria-label="Pick element"]').click()
}

const box = (page: Page, selector: string) => page.locator(selector).evaluate((el) => {
  const rect = el.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
})
const hoveredSpace = (page: Page) => page.evaluate(() => window.sg!.engine.geometry().candidate?.space?.name ?? null)

test('a padding is drawn under the pointer, picked by a click, and named by the Spacing issue', async ({ page }) => {
  await pickWithMeasure(page)
  const button = await box(page, '#cancel')
  // Inside the 14 px left padding, past the 1 px border.
  await page.mouse.move(button.x + 6, button.y + button.height / 2)
  await expect.poll(() => hoveredSpace(page)).toBe('padding-left')
  await expect(ui(page, '.guides .space')).toHaveCount(1)
  await expect(ui(page, '.measure-label.hover')).toHaveText('padding-left 14')
  await page.mouse.down()
  await page.mouse.up()
  expect(await page.evaluate(() => window.sg!.engine.state().space)).toEqual({ name: 'padding-left', size: 14 })
  await expect(ui(page, '.inspector .target .name')).toHaveText('button "Cancel"')
  await expect(ui(page, '.inspector .compose .kind-line')).toContainText('padding-left 14')
  await ui(page, '.inspector .compose .add').click()
  const issue = await page.evaluate(() => window.sg!.engine.state().drafts.issues[0]!)
  expect(issue.intent.preset.id).toBe('spacing')
  expect(issue.intent.params.space).toBe('padding-left')
  const task = await page.evaluate(() => window.sg!.engine.session.markdown(window.sg!.engine.session.draftBatch()))
  expect(task).toContain('Task: Reported: the left padding of A is wrong.')
})

test('the gap between two elements is picked as both of them, and the issue speaks of the gap', async ({ page }) => {
  await pickWithMeasure(page)
  const first = await box(page, '#box-a')
  // Half way across the 18 px gap of the flex row.
  await page.mouse.move(first.x + first.width + 9, first.y + 10)
  await expect.poll(() => hoveredSpace(page)).toBe('gap')
  await page.mouse.down()
  await page.mouse.up()
  expect(await page.evaluate(() => window.sg!.engine.state().space)).toEqual({ name: 'gap', size: 18 })
  await expect(ui(page, '.inspector .target .name')).toHaveText('2 elements')
  await ui(page, '.inspector .compose .add').click()
  const task = await page.evaluate(() => window.sg!.engine.session.markdown(window.sg!.engine.session.draftBatch()))
  expect(task).toContain('Task: Reported: the gap between the members of A is wrong.')
  expect(task).not.toContain('holds for each of them')
})

test('without measurements a click in a padding picks the element, as it always did', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label="Pick element"]').click()
  const button = await box(page, '#cancel')
  await page.mouse.click(button.x + 6, button.y + button.height / 2)
  await expect(ui(page, '.inspector .target .name')).toHaveText('button "Cancel"')
  expect(await page.evaluate(() => window.sg!.engine.state().space)).toBeNull()
  await expect(ui(page, '.guides .space')).toHaveCount(0)
})

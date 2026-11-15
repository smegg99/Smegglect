// tests/e2e/popout.spec.ts
// The pop-out: the toolbar and the panel in their own window; the page keeps only its markers until it is closed.
import { expect, test, type Page } from '@playwright/test'
import { moreItem, pick, ui } from './helpers'

const expanded = (page: Page) => page.evaluate(() => window.sg!.engine.state().expanded)

async function popOut(page: Page) {
  const opened = page.waitForEvent('popup')
  await moreItem(page, 'Pop out to a window')
  const popup = await opened
  return { popup, inPopup: (selector: string) => popup.locator(`smegglect-root ${selector}`) }
}

test('popped out, the page shows only its markers; the toolbar and the panel work from their window', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Half-written')
  const { popup, inPopup } = await popOut(page)
  await expect(inPopup('.in-window .inspector.window')).toBeVisible()
  await expect(ui(page, '.dock')).toHaveCount(0)
  await expect(ui(page, '.inspector')).toHaveCount(0)
  // The same panel moved: what was being written is still there, and it adds from there.
  await expect(inPopup('.compose textarea')).toHaveValue('Half-written')
  await inPopup('.compose .add').click()
  await expect.poll(() => page.evaluate(() => window.sg!.engine.state().drafts.issues.map(i => i.intent.note))).toEqual(['Half-written'])
  await expect(inPopup('.toast')).toBeVisible()
  await expect(ui(page, '.toast')).toHaveCount(0)

  // A key in the window acts on the page: pick there, see it here.
  await inPopup('.dock [aria-label="Pick element"]').click()
  await page.locator('#submit').click()
  await expect(inPopup('.inspector')).toContainText('Save order')
  // Shortcuts work with the window focused.
  await popup.bringToFront()
  await inPopup('.inspector [role="tab"]').first().focus()
  await popup.keyboard.press('Alt+Shift+M')
  await expect.poll(() => page.evaluate(() => window.sg!.engine.state().measuring)).toBe(true)
})

test('Put back leads the window\'s toolbar and brings everything back to the page, the button included', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  const { popup, inPopup } = await popOut(page)
  await expect(inPopup('.dock > .key').first()).toHaveAttribute('aria-label', 'Put back on the page')
  // The window closes under the click; Firefox reports that as a failed click.
  await Promise.all([popup.waitForEvent('close'), inPopup('.dock [aria-label="Put back on the page"]').click().catch(() => {})])
  await expect(ui(page, '.dock .toggle')).toBeVisible()
  await expect(ui(page, '.dock [aria-label="Pick element"]')).toBeVisible()
  await expect(ui(page, '.inspector')).toBeVisible()
})

test('the button always opens on the page; closing the window folds the overlay and brings the button back', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  let { popup } = await popOut(page)
  await expect(ui(page, '.dock')).toHaveCount(0)
  await popup.close()
  const toggle = ui(page, '.dock .toggle')
  await expect(toggle).toBeVisible()
  expect(await expanded(page)).toBe(false)

  // Nothing is remembered: the button opens the overlay here, and More pops it out again.
  let popups = 0
  page.on('popup', () => popups++)
  await toggle.click()
  await expect(ui(page, '.dock [aria-label="Pick element"]')).toBeVisible()
  expect(popups).toBe(0)
  const opened = page.waitForEvent('popup')
  await ui(page, '.dock [aria-label="More"]').click()
  await ui(page, '.pop [role="menuitem"]').filter({ hasText: 'Pop out to a window' }).click()
  popup = await opened
  await expect(ui(page, '.dock')).toHaveCount(0)
  // Alt+Shift+S on the page folds it too, and closes the window.
  const closed = popup.waitForEvent('close')
  await page.bringToFront()
  await page.locator('#cancel').focus()
  await page.keyboard.press('Alt+Shift+S')
  await closed
  await expect(toggle).toBeVisible()
  expect(await expanded(page)).toBe(false)
})

test('the ribbon has no line under it and More at its far end', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  const { popup, inPopup } = await popOut(page)
  const ribbon = inPopup('.inspector > .dock.ribbon')
  await expect(ribbon).toBeVisible()
  expect(await ribbon.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none')
  const more = (await inPopup('.dock [aria-label="More"]').boundingBox())!
  const width = await popup.evaluate(() => document.documentElement.clientWidth)
  expect(width - (more.x + more.width)).toBeLessThanOrEqual(6)
  // No rule stands alone before it.
  const keys = await ribbon.evaluate(el => [...el.children].map(c => c.classList.contains('rule') ? '|' : (c as HTMLElement).dataset.tool))
  expect(keys.at(-1)).toBe('more')
  expect(keys.at(-2)).not.toBe('|')
})

// tests/e2e/motion.spec.ts
// The toolbar's button and motion: a paw that fills the button, transitions that Settings turns off, and one
// size on the side edges when asked.
import { expect, test, type Page } from '@playwright/test'
import { settingSwitch, ui } from './helpers'

test.use({ reducedMotion: 'no-preference' })

const box = (page: Page, selector: string) => ui(page, selector).evaluate((el) => {
  const rect = el.getBoundingClientRect()
  return { width: Math.round(rect.width), height: Math.round(rect.height) }
})

test('the paw fills its button, folded and open', async ({ page }) => {
  await page.goto('/plain.html?memory')
  const button = await box(page, '.dock .toggle')
  const paw = await box(page, '.dock .toggle svg')
  expect(paw.width).toBe(button.width - 8)
  await page.evaluate(() => window.sg!.engine.setExpanded(true))
  expect(await box(page, '.dock .toggle')).toEqual(button)
  // Open, the toolbar shows captions at this width, and the row and the paw grow together.
  const open = await box(page, '.dock .toggle svg')
  expect(open.width).toBeGreaterThanOrEqual(paw.width)
})

test('the toolbar and panel move and open with transitions, and Settings turns them off', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  // The longest transition on the element, in ms; S99AB's own motion switch leaves a hundredth of one.
  const longest = (selector: string) => ui(page, selector).evaluate((el) => {
    return Math.max(...getComputedStyle(el).transitionDuration.split(',').map(value => Number.parseFloat(value) * 1000))
  })
  expect(await longest('.dock')).toBeGreaterThanOrEqual(100)
  await ui(page, '.dock [data-tool="settings"]').click()
  await expect(ui(page, '.inspector')).toBeVisible()
  await settingSwitch(page, 'Animations').uncheck()
  await expect.poll(() => longest('.dock')).toBeLessThan(1)
  expect(await page.locator('smegglect-root').getAttribute('data-motion')).toBe('off')
  // The panel now closes at once: no leave transition keeps it on the page.
  await ui(page, '.dock [data-tool="settings"]').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
})

test('on a side edge the toolbar keeps its size and captions only when asked', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  const bottom = await box(page, '.dock .toggle')
  await page.evaluate(() => window.sg!.update({ placement: 'right', offset: 0.5 }))
  await expect(ui(page, '.dock')).toHaveClass(/vertical/)
  await expect(ui(page, '.dock.captions')).toHaveCount(0)
  // Sizes ease, so they are read once they settle.
  await expect.poll(async () => (await box(page, '.dock .toggle')).width).toBeLessThan(bottom.width)

  await page.evaluate(() => window.sg!.update({ steadySize: true }))
  await expect(ui(page, '.dock.captions')).toHaveCount(1)
  await expect.poll(() => box(page, '.dock .toggle')).toEqual(bottom)
  // One width for every key in a column; a toolbar taller than its room wraps into another column.
  const widthsPerColumn = () => ui(page, '.dock > .key:not(.toggle)').evaluateAll((keys) => {
    const columns = new Map<number, Set<number>>()
    for (const key of keys) {
      const rect = key.getBoundingClientRect()
      const column = columns.get(Math.round(rect.left)) ?? new Set<number>()
      column.add(Math.round(rect.width))
      columns.set(Math.round(rect.left), column)
    }
    return [...columns.values()].map(widths => widths.size)
  })
  await expect.poll(async () => (await widthsPerColumn()).every(count => count === 1)).toBe(true)
})

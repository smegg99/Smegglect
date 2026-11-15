// tests/e2e/drawer.spec.ts
// The inspector is a drawer out of the toolbar: as wide as it, beside it on any edge, sliding in and out.
import { expect, test, type Page } from '@playwright/test'
import { pick, ui } from './helpers'

test.use({ reducedMotion: 'no-preference' })

const box = async (page: Page, selector: string) => (await ui(page, selector).boundingBox())!

/** Records the drawer's transition each time it starts to come or go: the class, what moves, for how long. */
async function watchDrawer(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector('smegglect-root')!.shadowRoot!
    const steps: string[] = []
    ;(window as unknown as { drawerSteps: string[] }).drawerSteps = steps
    new MutationObserver(() => {
      for (const el of root.querySelectorAll('.inspector')) {
        for (const name of ['sg-open-enter-active', 'sg-open-leave-active']) {
          const step = name.replace('sg-open-', '').replace('-active', '')
          if (!el.classList.contains(name) || steps.some(seen => seen.startsWith(step))) continue
          const style = getComputedStyle(el)
          const rect = el.getBoundingClientRect()
          steps.push(`${step}|${style.transitionProperty}|${style.transitionDuration}|${Math.round(rect.width)}`)
        }
      }
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  })
}

const steps = (page: Page) => page.evaluate(() => (window as unknown as { drawerSteps: string[] }).drawerSteps)
/** The longest transition of a step, in ms, for what it names. */
function longest(step: string, property: string): number {
  const [, properties, durations] = step.split('|')
  const names = properties!.split(',').map(name => name.trim())
  const times = durations!.split(',').map(value => Number.parseFloat(value) * 1000)
  return Math.max(0, ...names.map((name, i) => (name === property || name === 'all' ? times[i % times.length]! : 0)))
}

test('the drawer opens out of the toolbar, as wide as it, just above it', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await expect(ui(page, '.inspector')).toBeVisible()
  await expect.poll(async () => {
    const [drawer, dock] = [await box(page, '.inspector'), await box(page, '.dock')]
    return [Math.round(drawer.x - dock.x), Math.round(drawer.width - dock.width), Math.round(dock.y - 8 - (drawer.y + drawer.height))]
  }).toEqual([0, 0, 0])
})

test('the drawer slides out of the toolbar and back into it', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await watchDrawer(page)
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector')).toBeVisible()
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
  const [enter, leave] = await steps(page)
  for (const step of [enter!, leave!]) {
    expect(longest(step, 'transform')).toBeGreaterThanOrEqual(100)
    expect(longest(step, 'opacity')).toBeGreaterThanOrEqual(100)
  }
  expect(enter).toMatch(/^enter/)
  expect(leave).toMatch(/^leave/)
})

test('folding the overlay folds the drawer into the toolbar, at the size it had', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label^="Issues"]').click()
  // Once it has finished sliding out.
  await expect(ui(page, '.inspector')).not.toHaveClass(/sg-open-enter/)
  const open = await box(page, '.inspector')
  await watchDrawer(page)
  await ui(page, '.dock .toggle').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
  const [leave] = await steps(page)
  expect(leave).toMatch(/^leave/)
  expect(longest(leave!, 'transform')).toBeGreaterThanOrEqual(100)
  // It does not shrink to the folded button on its way out.
  expect(Number(leave!.split('|')[3])).toBe(Math.round(open.width))
})

test('with animations off the drawer comes and goes at once', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await page.evaluate(() => window.sg!.update({ motion: false }))
  await watchDrawer(page)
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector')).toBeVisible()
  await ui(page, '.dock .toggle').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
  for (const step of await steps(page)) expect(longest(step, 'transform')).toBeLessThan(20)
})

test('a drawer open when the overlay folds opens again at its tab when it unfolds; a closed one stays closed', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector')).toBeVisible()
  await ui(page, '.dock .toggle').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
  await ui(page, '.dock .toggle').click()
  await expect(ui(page, '.inspector')).toBeVisible()
  await expect(ui(page, '.dock [data-tool="issues"]')).toHaveAttribute('aria-expanded', 'true')
  // From the keyboard too, and the shortcut still lands on Pick, not in the drawer.
  await page.locator('#cancel').focus()
  await page.keyboard.press('Alt+Shift+S')
  await expect(ui(page, '.inspector')).toHaveCount(0)
  await page.keyboard.press('Alt+Shift+S')
  await expect(ui(page, '.inspector')).toBeVisible()
  const focused = () => page.evaluate(() => document.querySelector('smegglect-root')!.shadowRoot!.activeElement?.getAttribute('aria-label'))
  await expect.poll(focused).toBe('Pick element')
  // Closed before folding, it stays closed.
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
  await ui(page, '.dock .toggle').click()
  await ui(page, '.dock .toggle').click()
  await expect(ui(page, '.dock [aria-label="Pick element"]')).toBeVisible()
  await expect(ui(page, '.inspector')).toHaveCount(0)
})

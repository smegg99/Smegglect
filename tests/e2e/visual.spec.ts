// tests/e2e/visual.spec.ts
// Visual checkpoint captures. Runs only with SMEGGLECT_SHOTS=1; writes to docs/smegglect/evidence/ (ignored by Git).
import { expect, test, type Page } from '@playwright/test'
import { preset, settle, tile, ui } from './helpers'

const OUT = 'docs/smegglect/evidence'
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '800', width: 800, height: 600 },
]

test.skip(!process.env.SMEGGLECT_SHOTS, 'set SMEGGLECT_SHOTS=1 to capture')
test.describe.configure({ mode: 'serial' })

async function shot(page: Page, name: string) {
  await settle(page)
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${OUT}/${test.info().project.name}-${name}.png` })
}

async function pick(page: Page, selector: string) {
  const mode = await ui(page, '[aria-label="Pick element"]').getAttribute('aria-pressed')
  if (mode !== 'true') await ui(page, '[aria-label="Pick element"]').click()
  await page.locator(selector).first().click()
}

async function addMatchHeight(page: Page, a: string, b: string) {
  await pick(page, a)
  await tile(page, 'match-height').click()
  await page.locator(b).first().hover()
}

for (const vp of VIEWPORTS) {
  test(`checkpoint ${vp.name}`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine is enough for the visual record')
    await page.setViewportSize({ width: vp.width, height: vp.height })

    // 1. collapsed and expanded on light and dark hosts
    await page.goto('/plain.html')
    await shot(page, `${vp.name}-light-collapsed`)
    await ui(page, '.launcher .key').click()
    await shot(page, `${vp.name}-light-dock`)
    await page.goto('/workbench.html?open')
    await shot(page, `${vp.name}-dark-dock`)

    // 2. one selected control with its strip
    await pick(page, '#settings')
    await shot(page, `${vp.name}-dark-selected`)
    await page.goto('/plain.html?open')
    await pick(page, '#submit')
    await shot(page, `${vp.name}-light-selected`)

    // 3. A/B match height with only height guides
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await addMatchHeight(page, '#box-a', '#box-b')
    await shot(page, `${vp.name}-light-reference`)
    await page.locator('#box-b').click()
    await shot(page, `${vp.name}-light-compose`)
    await ui(page, '.inspector .form .key.primary').click()

    // 4. three issues on the page, then the drawer with one expanded and a long note
    await pick(page, '#clip')
    await preset(page, 'clipped')
    await pick(page, '#cancel')
    await preset(page, 'size', { choice: 'Too narrow' })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.mouse.move(vp.width - 40, vp.height / 2)
    await shot(page, `${vp.name}-light-annotations`)
    await ui(page, '.dock [aria-label^="Issues"]').click()
    await ui(page, '.inspector [data-issue]').first().click()
    await page.locator('smegglect-root .issue-view textarea').fill('The heading row is taller than the reference card, so the two columns never line up when the window is narrow. This note is long on purpose to check wrapping in the details panel.')
    await page.locator('smegglect-root .issue-view textarea').blur()
    await shot(page, `${vp.name}-light-drawer`)

    // 5. unavailable target: remove the element behind issue 2
    await page.evaluate(() => document.getElementById('clip')?.remove())
    await ui(page, '.inspector [data-issue]').nth(1).click()
    await shot(page, `${vp.name}-light-unavailable`)
    expect(await ui(page, '.inspector [data-issue][data-status="unavailable"]').count()).toBeGreaterThan(0)
    await ui(page, '.inspector .foot .primary').click()
    await shot(page, `${vp.name}-light-report`)
  })
}

test('checkpoint zoom 200 and reduced motion', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'one engine is enough for the visual record')
  const context = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/plain.html?open')
  await pick(page, '#submit')
  await shot(page, 'zoom200-selected')
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await shot(page, 'zoom200-drawer')
  await context.close()
})

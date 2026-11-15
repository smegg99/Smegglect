// tests/e2e/button.spec.ts
// The button: one place on an edge, dragged along any edge, with the toolbar unfolding from it.
import { expect, test, type Page } from '@playwright/test'
import { pick, preset, ui } from './helpers'

const toggle = (page: Page) => ui(page, '.dock .toggle')
const pickKey = (page: Page) => ui(page, '.dock [aria-label="Pick element"]')
const at = async (page: Page) => {
  const b = (await toggle(page).boundingBox())!
  return { x: Math.round(b.x), y: Math.round(b.y) }
}

test('the button keeps its place: it unfolds the toolbar, and the same spot folds it again', async ({ page }) => {
  await page.goto('/plain.html?memory')
  const before = await at(page)
  await toggle(page).click()
  await expect(pickKey(page)).toBeVisible()
  expect(await at(page)).toEqual(before)
  const b = (await toggle(page).boundingBox())!
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await expect(pickKey(page)).toHaveCount(0)
  expect(await at(page)).toEqual(before)
})

for (const [placement, large] of [['bottom', false], ['top', false], ['bottom', true]] as const) {
  test(`on the ${placement} edge${large ? ' with large keys' : ''} the button is one centred square, folded or open`, async ({ page }) => {
    await page.goto('/plain.html?memory')
    await page.evaluate(([p, l]) => window.sg!.update({ placement: p, large: l }), [placement, large] as const)
    const folded = (await toggle(page).boundingBox())!
    const frame = (await ui(page, '.dock').boundingBox())!
    await toggle(page).click()
    await expect(pickKey(page)).toBeVisible()
    await expect(ui(page, '.dock .caption').first()).toBeVisible()
    const open = (await toggle(page).boundingBox())!
    const bar = (await ui(page, '.dock').boundingBox())!
    expect(open).toEqual(folded)
    expect(folded.width).toBe(folded.height)
    expect(bar.height).toBe(frame.height)
    expect(Math.abs(open.y + open.height / 2 - (bar.y + bar.height / 2))).toBeLessThanOrEqual(0.5)
    for (const key of await ui(page, '.dock > .key').all()) expect((await key.boundingBox())!.height).toBe(open.height)
  })
}

test('the toolbar grows toward the side with more room, the button at its end', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await page.evaluate(() => window.sg!.update({ offset: 0.85 }))
  await expect.poll(async () => (await pickKey(page).boundingBox())!.x < (await toggle(page).boundingBox())!.x).toBe(true)
  await page.evaluate(() => window.sg!.update({ offset: 0.15 }))
  await expect.poll(async () => (await pickKey(page).boundingBox())!.x > (await toggle(page).boundingBox())!.x).toBe(true)
})

test('dragging moves the button to the nearest edge; a drag does not toggle, and the place is kept', async ({ page }) => {
  await page.goto('/plain.html?memory')
  const b = (await toggle(page).boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(400, 500, { steps: 6 })
  await page.mouse.move(6, 300, { steps: 6 })
  await page.mouse.up()
  await expect(pickKey(page)).toHaveCount(0)
  const left = (await toggle(page).boundingBox())!
  // 12 px from the edge plus the dock's 1 px frame and 3 px padding; centred where it was dropped.
  expect(Math.round(left.x)).toBe(16)
  expect(Math.abs(left.y + left.height / 2 - 300)).toBeLessThanOrEqual(1)
  await toggle(page).click()
  const pick = (await pickKey(page).boundingBox())!
  expect(pick.y).toBeGreaterThan(left.y)
  expect(Math.abs(pick.x - left.x)).toBeLessThanOrEqual(1)
  // A side toolbar's rules run across it: one pixel tall, as wide as a key less its inset.
  for (const rule of await ui(page, '.dock .rule').all()) expect((await rule.boundingBox())!.height).toBe(1)
  await page.reload()
  expect(await at(page)).toEqual({ x: Math.round(left.x), y: Math.round(left.y) })
})

test('an open toolbar travels with the button while it is dragged, and its drawer with it', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label^="Issues"]').click()
  const panel = ui(page, '.inspector')
  await expect(panel).toBeVisible()
  const b = (await toggle(page).boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(640, 300, { steps: 6 })
  await page.mouse.move(page.viewportSize()!.width - 6, 300, { steps: 6 })
  // Still dragging: the toolbar runs down the right edge from the button, and the drawer opens beside it.
  await expect(pickKey(page)).toBeVisible()
  const held = (await toggle(page).boundingBox())!
  const pick = (await pickKey(page).boundingBox())!
  expect(Math.abs(pick.x - held.x)).toBeLessThanOrEqual(1)
  const dock = (await ui(page, '.dock').boundingBox())!
  await expect.poll(async () => {
    const box = (await panel.boundingBox())!
    return [Math.round(dock.x - 8 - (box.x + box.width)), Math.round(box.y - dock.y)]
  }).toEqual([0, 0])
  await page.mouse.up()
  // A drag does not toggle: the toolbar stays open where it was dropped.
  await expect(pickKey(page)).toBeVisible()
  expect(await at(page)).toEqual({ x: Math.round(held.x), y: Math.round(held.y) })
})

test('a toast keeps away from the toolbar while the button is dragged to its edge', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await preset(page, 'note', { note: 'Too dark' })
  await ui(page, '.inspector [aria-label="Close inspector"]').click()
  await page.keyboard.press('Alt+Shift+Z')
  const toast = ui(page, '.toast')
  await expect(toast).toContainText('Undone')
  // Away from the toolbar at the bottom: at the top.
  expect((await toast.boundingBox())!.y).toBeLessThan(100)
  const b = (await toggle(page).boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(300, 6, { steps: 8 })
  await expect.poll(async () => (await toast.boundingBox())!.y).toBeGreaterThan(400)
  await page.mouse.up()
})

test('on a phone-sized page the toolbar wraps away from the edge and the button stays put', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/plain.html?memory')
  const before = await at(page)
  await toggle(page).click()
  await expect(pickKey(page)).toBeVisible()
  expect(await at(page)).toEqual(before)
  const dock = (await ui(page, '.dock').boundingBox())!
  expect(dock.x).toBeGreaterThanOrEqual(0)
  expect(dock.x + dock.width).toBeLessThanOrEqual(375)
  expect(dock.y + dock.height).toBeLessThanOrEqual(667)
  // More than one row, and the button is in the one on the edge.
  const tops = new Set<number>()
  for (const key of await ui(page, '.dock > .key').all()) tops.add(Math.round((await key.boundingBox())!.y))
  expect(tops.size).toBeGreaterThan(1)
  expect(Math.max(...tops)).toBe(before.y)
  // A row may not start with a rule, so a wrapped toolbar has none.
  for (const rule of await ui(page, '.dock .rule').all()) await expect(rule).toBeHidden()
})

test('the toolbar groups what acts on the page, the history, the issues and the panel', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  const keys = await ui(page, '.dock').evaluate(el => [...el.children].map(c => c.classList.contains('rule') ? '|' : (c as HTMLElement).dataset.tool ?? 'toggle'))
  expect(keys.join(' ')).toBe('toggle | pick region measure | undo redo | annotations issues | settings more')
})

test('before the button the tools still read Pick to More, and arrow keys follow them as drawn', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await page.evaluate(() => window.sg!.update({ offset: 0.9 }))
  const xs: Record<string, number> = {}
  for (const name of ['Pick element', 'Draw region', 'Undo', 'More', 'Collapse']) xs[name] = (await ui(page, `.dock [aria-label="${name}"]`).boundingBox())!.x
  expect(Object.keys(xs).sort((a, b) => xs[a]! - xs[b]!)).toEqual(['Pick element', 'Draw region', 'Undo', 'More', 'Collapse'])
  const focused = () => page.evaluate(() => document.querySelector('smegglect-root')!.shadowRoot!.activeElement?.getAttribute('aria-label'))
  await pickKey(page).focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(focused).toBe('Draw region')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(focused).toBe('Collapse')
})

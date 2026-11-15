// tests/e2e/annotate.spec.ts
// The on-page issue workflow: composer, duplicates, plates, undo and redo, history.
import { expect, test } from '@playwright/test'
import { action, draftIssues, pick, preset, settle, tap, ui } from './helpers'


test.beforeEach(async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await expect(ui(page, '.dock')).toBeVisible()
})

test('match height needs no typing and nothing is recorded before Add', async ({ page }) => {
  const requests: string[] = []
  page.on('request', r => requests.push(r.url()))
  await pick(page, '#cancel')
  await preset(page, 'match-height', { b: '#submit', keepOpen: true })
  await expect(ui(page, '.inspector .reference')).toContainText('button "Save order"')
  await expect(ui(page, '.inspector .reference .cmp')).toContainText('height')
  expect(await draftIssues(page)).toHaveLength(0)
  await ui(page, '.inspector .compose .add').click()
  const list = await draftIssues(page)
  expect(list).toHaveLength(1)
  expect(list[0]!.intent).toMatchObject({ preset: { id: 'match-height' }, note: '', scope: 'occurrence', constraints: [] })
  await expect(ui(page, '.toast')).toContainText('Issue 1 added')
  expect(requests).toEqual([])
})

test('a missing reference asks only for B; Escape adds nothing, keeps A and goes back to a note', async ({ page }) => {
  await pick(page, '#box-a')
  await (await action(page, 'match-width')).click()
  await expect(ui(page, '.inspector .waiting')).toContainText('Pick B, the reference for: Match width')
  await page.locator('#box-a').click()
  await expect(ui(page, '.inspector .waiting')).toContainText('B must be a different element than A.')
  await page.keyboard.press('Escape')
  await expect(ui(page, '.inspector .waiting')).toHaveCount(0)
  expect(await draftIssues(page)).toHaveLength(0)
  expect(await ui(page, '.inspector .target .name').textContent()).toBe('div "A"')
  await expect(ui(page, '.inspector [data-tree="actions"] [aria-selected="true"]')).toHaveText('Note')
  expect(await draftIssues(page)).toHaveLength(0)
})

test('group alignment needs an explicit anchor; equal gaps is symmetric', async ({ page }) => {
  await pick(page, '#box-a')
  await pick(page, '#box-b', { shift: true })
  await preset(page, 'group-align', { keepOpen: true })
  await expect(ui(page, '.inspector .waiting')).toContainText('Pick the group member the others align to')
  await tap(page, '#submit')
  await expect(ui(page, '.inspector .waiting')).toContainText('Pick one of the group members.')
  await tap(page, '#box-b')
  await ui(page, '.inspector .compose .add').click()
  await preset(page, 'equal-gaps')
  const list = await draftIssues(page)
  expect(list.map(i => i.intent.preset.id)).toEqual(['group-align', 'equal-gaps'])
  expect(list[0]!.operands.a).toMatchObject({ kind: 'group', anchor: 1 })
  expect(list[1]!.operands.a.kind === 'group' && list[1]!.operands.a.anchor).toBeUndefined()
})

test('consistency presets compare a group or an A/B pair and flag what differs', async ({ page }) => {
  await pick(page, '#box-a')
  await pick(page, '#box-b', { shift: true })
  await preset(page, 'consistent-size', { keepOpen: true })
  await expect(ui(page, '.inspector .reference .cmp thead th')).toHaveText(['Property', '1', '2'])
  await expect(ui(page, '.inspector .reference .cmp tr[data-flagged] th')).toHaveText(['width (differs)', 'height (differs)'])
  await ui(page, '.inspector .compose .add').click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await pick(page, '#cancel')
  await preset(page, 'consistent-padding', { b: '#submit', keepOpen: true })
  await expect(ui(page, '.inspector .reference .cmp thead th')).toHaveText(['Property', 'A', 'B'])
  await ui(page, '.inspector .compose .add').click()
  const list = await draftIssues(page)
  expect(list.map(i => i.intent.preset.id)).toEqual(['consistent-size', 'consistent-padding'])
  expect(list[1]!.operands.b?.kind).toBe('dom')
})

test('the same issue is never added twice; undo, redo, edit and delete are predictable', async ({ page }) => {
  await pick(page, '#clip')
  await preset(page, 'clipped')
  await preset(page, 'clipped')
  await expect(ui(page, '.inspector .compose .notice')).toContainText('Already reported as issue 1.')
  await expect(ui(page, '.inspector .compose .add')).toBeDisabled()
  expect(await draftIssues(page)).toHaveLength(1)
  await expect(ui(page, '.inspector .here .here-line')).toHaveText('1Text clipped')
  await ui(page, '.dock [aria-label="Undo"]').click()
  expect(await draftIssues(page)).toHaveLength(0)
  await ui(page, '.dock [aria-label="Redo"]').click()
  expect(await draftIssues(page)).toHaveLength(1)
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector [data-issue]').first().click()
  await page.locator('smegglect-root .issue-view textarea').first().fill('Keep the ellipsis but show a tooltip')
  await page.locator('smegglect-root .issue-view textarea').first().blur()
  expect((await draftIssues(page))[0]!.intent.note).toBe('Keep the ellipsis but show a tooltip')
  await ui(page, '.issue-view [aria-label="Delete"]').click()
  expect(await draftIssues(page)).toHaveLength(0)
  await page.keyboard.press('Alt+Shift+Z')
  expect((await draftIssues(page))[0]!.intent.note).toBe('Keep the ellipsis but show a tooltip')
})

test('the scope changes the exported task; default is this occurrence', async ({ page }) => {
  await pick(page, '#box-a')
  await preset(page, 'size')
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector [data-issue]').first().click()
  await expect(ui(page, '.issue-view .task')).toContainText('Reported: the size of A is wrong.')
  const everywhere = ui(page, '.issue-view').getByRole('checkbox', { name: 'Everywhere this component is used' })
  await expect(everywhere).not.toBeChecked()
  await everywhere.check()
  const md = await page.evaluate(() => window.sg!.engine.session.markdown(window.sg!.engine.session.draftBatch()))
  expect(md).toContain('Scope: The change belongs in the shared component')
})

test('a behaviour issue needs a note; HTML in it stays text (E03)', async ({ page }) => {
  await pick(page, '#submit')
  await preset(page, 'feedback', { keepOpen: true })
  await expect(ui(page, '.inspector .compose .add')).toBeDisabled()
  await ui(page, '.inspector .compose textarea').fill('<img src=x onerror="window.pwned=1"> nothing happens on click')
  await ui(page, '.inspector .compose textarea').press('Control+Enter')
  await expect.poll(async () => (await draftIssues(page)).length).toBe(1)
  await settle(page)
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
  expect(await page.evaluate(() => document.querySelector('smegglect-root')!.shadowRoot!.querySelectorAll('img').length)).toBe(0)
  await expect(ui(page, '.plate .said')).toContainText('<img src=x')
})

test('issues stay on the page as plates; regions and notes stay where they were drawn', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 500 })
  await page.evaluate(() => (document.body.style.paddingBottom = '600px'))
  // The drawer opens beside the toolbar: on the left edge it leaves the middle of the page free.
  await page.evaluate(() => window.sg!.update({ placement: 'left' }))
  await pick(page, '#clip')
  await preset(page, 'clipped')
  await ui(page, '.dock [aria-label="Draw region"]').click()
  await page.mouse.move(700, 380)
  await page.mouse.down()
  await page.mouse.move(900, 460, { steps: 4 })
  await page.mouse.up()
  await preset(page, 'note', { note: 'Empty corner on wide screens' })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(ui(page, '.plate')).toHaveCount(2)
  await expect(ui(page, '.plate').filter({ hasText: 'Text clipped' })).toBeVisible()
  await expect(ui(page, '.plate').filter({ hasText: 'Empty corner on wide screens' })).toBeVisible()
  const region = async () => (await page.locator('smegglect-root .guides.marks rect.region').boundingBox())!
  const before = await region()
  await page.evaluate(() => window.scrollBy(0, 50))
  await settle(page)
  const after = await region()
  expect(Math.round(before.y - after.y)).toBe(50)
  // Outlines are drawn where the target is, not scaled.
  const mark = (await page.locator('smegglect-root .guides.marks rect.mark').first().boundingBox())!
  const clip = (await page.locator('#clip').boundingBox())!
  expect(Math.abs(mark.x - clip.x)).toBeLessThan(1.5)
  expect(Math.abs(mark.width - clip.width)).toBeLessThan(2)
  // The X on a plate deletes the issue; undo brings it back.
  await ui(page, '.plate').filter({ hasText: 'Text clipped' }).locator('.plate-x').click()
  await expect(ui(page, '.plate')).toHaveCount(1)
  await ui(page, '.dock [aria-label="Undo"]').click()
  await expect(ui(page, '.plate')).toHaveCount(2)
  // Hiding issues removes the layer.
  await ui(page, '.dock [aria-label="Show issues on the page"]').click()
  await expect(ui(page, '.plate')).toHaveCount(0)
})

test('plates move away from the pointer and can still be reached', async ({ page }) => {
  await pick(page, '#box-a')
  await preset(page, 'clipped')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.mouse.move(100, 700)
  await settle(page)
  const home = (await ui(page, '.plate').boundingBox())!
  await page.mouse.move(home.x + 40, home.y + home.height + 20)
  await expect.poll(async () => (await ui(page, '.plate').boundingBox())!.y).toBeLessThan(home.y - 10)
  const pushed = (await ui(page, '.plate').boundingBox())!
  expect(Math.abs(pushed.x - home.x)).toBeLessThan(1)
  // One step per frame, as a real pointer moves; the plate is reached once it is pushed no further.
  for (let y = home.y + home.height + 20; y > pushed.y - 20; y -= 8) {
    await page.mouse.move(home.x + 40, y)
    await settle(page)
    if (await page.evaluate(() => !!document.querySelector('smegglect-root')!.shadowRoot!.querySelector('.plate.on'))) break
  }
  await expect(ui(page, '.plate.on')).toHaveCount(1)
})

test('with plates moving out of the way turned off, a plate stays put by the pointer', async ({ page }) => {
  await page.evaluate(() => window.sg!.update({ dodge: false }))
  await pick(page, '#box-a')
  await preset(page, 'clipped')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.mouse.move(100, 700)
  await settle(page)
  const home = (await ui(page, '.plate').boundingBox())!
  await page.mouse.move(home.x + 40, home.y + home.height + 20)
  await page.waitForTimeout(250)
  expect((await ui(page, '.plate').boundingBox())!.y).toBe(home.y)
})

test('the history lists what happened, newest first', async ({ page }) => {
  await pick(page, '#clip')
  await preset(page, 'clipped')
  await pick(page, '#box-a')
  await preset(page, 'size')
  await ui(page, '.plate').filter({ hasText: 'Text clipped' }).locator('.plate-x').click()
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
  const lines = await page.locator('smegglect-root .history li .what > :first-child').allTextContents()
  expect(lines.slice(0, 3)).toEqual(['Deleted 1: Text clipped', 'Added 2: Size', 'Added 1: Text clipped'])
})

test('a toast never sits by the toolbar: in the panel above the issue form, else at the far edge', async ({ page }) => {
  const box = (selector: string) => ui(page, selector).first().boundingBox()
  const apart = (a: { x: number, y: number, width: number, height: number }, b: typeof a) =>
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
  await pick(page, '#clip')
  await preset(page, 'clipped')
  await expect(ui(page, '.toast')).toBeVisible()
  await expect.poll(async () => (await box('.toast'))!.y).toBeGreaterThan(0)
  const panel = (await box('.inspector'))!
  const form = (await box('.inspector .compose'))!
  let toast = (await box('.toast'))!
  expect(toast.x).toBeGreaterThanOrEqual(panel.x)
  expect(toast.x + toast.width).toBeLessThanOrEqual(panel.x + panel.width)
  expect(toast.y + toast.height).toBeLessThanOrEqual(form.y)
  expect(toast.y).toBeGreaterThan(panel.y + panel.height / 2)
  expect(apart(toast, (await box('.dock'))!)).toBe(true)
  // With the panel closed, a deletion's toast goes to the top, away from the toolbar at the bottom.
  await ui(page, '.inspector [aria-label="Close inspector"]').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
  await ui(page, '.plate .plate-x').first().click()
  await expect(ui(page, '.toast')).toContainText('Issue removed')
  await expect.poll(async () => (await box('.toast'))!.y).toBeLessThan(40)
  toast = (await box('.toast'))!
  expect(apart(toast, (await box('.dock'))!)).toBe(true)
})

test('the added toast keeps its number and drops Undo once the batch is submitted', async ({ page }) => {
  await pick(page, '#clip')
  await preset(page, 'clipped')
  await expect(ui(page, '.toast')).toContainText('Issue 1 added')
  await expect(ui(page, '.toast button')).toHaveCount(1)
  await page.evaluate(() => window.sg!.engine.session.submit())
  await expect(ui(page, '.toast')).toContainText('Issue 1 added')
  await expect(ui(page, '.toast button')).toHaveCount(0)
})

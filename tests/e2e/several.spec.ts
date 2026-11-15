// tests/e2e/several.spec.ts
// Several elements at once: Ctrl- or Cmd-click adds them while picking, and an issue type that fits one element
// fits several; the task tells the agent it holds for each.
import { expect, test } from '@playwright/test'
import { pick, preset, tap, ui } from './helpers'

/** Every built-in issue type that is about one element, by its row in the type tree. */
const ONE_ELEMENT = [
  'size', 'spacing', 'touch-target', 'off-scale', 'clipped', 'overflow', 'overlap', 'text-wrap', 'center',
  'readability', 'text-wrong', 'wrong-color', 'icon', 'feedback', 'state-missing', 'keyboard', 'a11y-name',
  'inconsistent', 'responsive',
]

test('Ctrl- and Cmd-click add elements while picking, and remove one picked again', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label="Pick element"]').click()
  await page.click('#box-a', { modifiers: ['ControlOrMeta'] })
  // A modified click keeps picking on, and the hint says how to add more.
  await expect(ui(page, '.inspector .waiting')).toContainText('Shift- or Ctrl-click to select several')
  await page.click('#box-b', { modifiers: ['ControlOrMeta'] })
  await page.click('#box-c', { modifiers: ['ControlOrMeta'] })
  await expect(ui(page, '.inspector .target .name')).toHaveText('3 elements')
  await page.click('#box-b', { modifiers: ['ControlOrMeta'] })
  await expect(ui(page, '.inspector .target .name')).toHaveText('2 elements')
})

test('the empty Element tab offers to select several, which keeps picking', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await page.evaluate(() => window.sg!.engine.clear())
  await ui(page, '.inspector .empty .tile').filter({ hasText: 'Select several' }).click()
  await tap(page, '#box-a')
  await tap(page, '#box-b')
  await expect(ui(page, '.inspector .target .name')).toHaveText('2 elements')
  expect(await page.evaluate(() => window.sg!.engine.state().inspect.mode.kind)).toBe('pick')
})

test('several elements keep every issue type one element has, and the task says it holds for each', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label="Pick element"]').click()
  await page.click('#box-a', { modifiers: ['Shift'] })
  await page.click('#box-b', { modifiers: ['Shift'] })
  await expect(ui(page, '.inspector .target .name')).toHaveText('2 elements')
  const folded = ui(page, '.inspector [data-tree="actions"] [role="treeitem"][aria-expanded="false"]')
  while (await folded.count()) await folded.first().click()
  const offered = await page.evaluate(() => {
    const root = document.querySelector('smegglect-root')!.shadowRoot!
    return [...root.querySelectorAll('[data-tree="actions"] [data-preset]')].map(row => row.getAttribute('data-preset'))
  })
  for (const id of ONE_ELEMENT) expect(offered, id).toContain(id)
  await preset(page, 'clipped')
  const sentence = await page.evaluate(() => {
    const issue = window.sg!.engine.state().drafts.issues[0]!
    return window.sg!.engine.session.markdown({ ...window.sg!.engine.session.draftBatch(), issues: [issue] })
  })
  expect(sentence).toContain('Task: Reported: text in A is clipped.')
  expect(sentence).toContain('A is a group of 2 elements: this holds for each of them.')
})

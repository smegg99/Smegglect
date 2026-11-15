// tests/e2e/checks.spec.ts
// An agent's check: the conditions the page answered under, and why a target is gone.
import { expect, test } from '@playwright/test'
import { pick, ui } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Remove it')
  await ui(page, '.inspector .compose .add').click()
})

test('a removed target says how many could have been it and the nearest old ancestor still there', async ({ page }) => {
  const answer = await page.evaluate(() => {
    const issue = window.sg!.engine.state().drafts.issues[0]!
    document.getElementById('cancel')!.remove()
    return window.sg!.engine.check(issue)
  })
  expect(answer.status).toBe('unavailable')
  // By id: once removed, nothing else could have been it.
  expect(answer.missing?.candidates).toBe(0)
  expect(answer.missing?.ancestor).toMatchObject({ step: 'div', levelsUp: 1 })
  expect(answer.missing?.ancestor?.bounds.width).toBeGreaterThan(0)

  const further = await page.evaluate(() => {
    const issue = window.sg!.engine.state().drafts.issues[0]!
    document.querySelector('#order-form .actions')!.remove()
    return window.sg!.engine.check(issue)
  })
  expect(further.missing?.ancestor).toMatchObject({ step: 'form#order-form', levelsUp: 2 })
})

test('an answer carries the page\'s viewport, pixel ratio and colour scheme, and whether they are the report\'s', async ({ page }) => {
  const check = () => page.evaluate(() => window.sg!.engine.check(window.sg!.engine.state().drafts.issues[0]!))
  const same = await check()
  expect(same.status).toBe('live')
  expect(same.conditions.viewport).toEqual(page.viewportSize())
  expect(same.sameConditions).toBe(true)
  await page.setViewportSize({ width: 900, height: 700 })
  const other = await check()
  expect(other.conditions.viewport).toEqual({ width: 900, height: 700 })
  expect(other.sameConditions).toBe(false)
  const selection = await page.evaluate(() => window.sg!.engine.describeSelection())
  expect(selection.conditions).toMatchObject({ viewport: { width: 900, height: 700 } })
})

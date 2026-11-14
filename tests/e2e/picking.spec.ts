// tests/e2e/picking.spec.ts
// P01-P10: selection without activating host controls, boundaries, groups, identity.
import { expect, test, type Page } from '@playwright/test'
import { events, preset, settle, ui } from './helpers'

async function pickMode(page: Page) {
  const key = ui(page, '.dock [aria-label="Pick element"]')
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click()
  await expect(key).toHaveAttribute('aria-pressed', 'true')
}

async function chip(page: Page) {
  return (await ui(page, '.inspector .target .name').textContent())?.trim()
}

test.describe('plain host', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plain.html?open')
    await expect(ui(page, '.dock')).toBeVisible()
    await events(page)
  })

  test('P01 picking a submit button, checkbox and link activates none of them', async ({ page }) => {
    const url = page.url()
    // Each pick ends pick mode, so it is switched on again for every target.
    await pickMode(page)
    await page.click('#submit')
    expect(await chip(page)).toBe('button "Save order"')
    await pickMode(page)
    await page.click('#link')
    await pickMode(page)
    await page.click('#express')
    expect(await page.isChecked('#express')).toBe(false)
    await pickMode(page)
    await page.click('#customer')
    expect(await page.evaluate(() => document.activeElement?.id ?? '')).not.toBe('customer')
    await settle(page)
    expect(page.url()).toBe(url)
    expect(await events(page)).toEqual([])
    expect(await chip(page)).toMatch(/^input/)
  })

  test('P01 the click that ends a one-shot pick never reaches the host', async ({ page }) => {
    const url = page.url()
    for (const target of ['#express', '#submit', '#link']) {
      await pickMode(page)
      await page.click(target)
      await expect(ui(page, '.dock [aria-label="Pick element"]')).toHaveAttribute('aria-pressed', 'false')
    }
    await settle(page)
    expect(await page.isChecked('#express')).toBe(false)
    expect(page.url()).toBe(url)
    expect(await events(page)).toEqual([])
    // The next click after the pick belongs to the host again.
    await page.click('#express')
    expect(await page.isChecked('#express')).toBe(true)
  })

  test('review 5: a long press while picking still never reaches the host', async ({ page }) => {
    await pickMode(page)
    const b = (await page.locator('#express').boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(1400)
    await page.mouse.up()
    await settle(page)
    expect(await page.isChecked('#express')).toBe(false)
    expect(await chip(page)).toMatch(/^input/)
  })

  test('review 4: Add to group switches off when picking ends', async ({ page }) => {
    await pickMode(page)
    await page.click('#box-a')
    await ui(page, '.inspector .target [aria-label="Add to group with each pick"]').click()
    await page.click('#box-b')
    expect(await chip(page)).toBe('2 elements')
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => window.sg!.engine.state().extend)).toBe(false)
    await pickMode(page)
    await page.click('#submit')
    expect(await chip(page)).toBe('button "Save order"')
    await expect(ui(page, '.dock [aria-label="Pick element"]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('P02 leaving pick mode restores clicks, typing and scrolling', async ({ page }) => {
    await pickMode(page)
    await page.click('#cancel')
    await expect(ui(page, '.dock [aria-label="Pick element"]')).toHaveAttribute('aria-pressed', 'false')
    await page.click('#express')
    expect(await page.isChecked('#express')).toBe(true)
    await page.fill('#customer', 'Grace')
    expect(await page.inputValue('#customer')).toBe('Grace')
    await page.click('#submit')
    expect(await events(page)).toContain('submit:order-form')
    await page.mouse.wheel(0, 200)
    await page.waitForFunction(() => window.scrollY > 0 || document.documentElement.scrollHeight <= innerHeight)
  })

  test('P03 toolkit controls operate the toolkit and are never inspected', async ({ page }) => {
    await pickMode(page)
    await page.click('#cancel')
    await ui(page, '.dock [aria-label="Measurements"]').click()
    await expect(ui(page, '.dock [aria-label="Measurements"]')).toHaveAttribute('aria-pressed', 'true')
    expect(await chip(page)).toBe('button "Cancel"')
    await ui(page, '.inspector .target .chip').click()
    expect(await chip(page)).toBe('button "Cancel"')
  })

  test('P04 shift-click and the group toggle build a group; parent escalates', async ({ page }) => {
    await pickMode(page)
    await page.click('#box-a')
    await pickMode(page)
    await page.click('#box-b', { modifiers: ['Shift'] })
    expect(await chip(page)).toBe('2 elements')
    // Extending keeps pick mode on; a plain click replaces the group and ends it.
    await page.click('#box-c')
    expect(await chip(page)).toBe('div "C"')
    // The toggle switches picking back on and keeps every pick in the group.
    await ui(page, '.inspector .target [aria-label="Add to group with each pick"]').click()
    await page.click('#box-a')
    expect(await chip(page)).toBe('2 elements')
    await page.click('#submit')
    expect(await chip(page)).toBe('3 elements')
  })

  test('P04 parent escalation from an svg child to its button', async ({ page }) => {
    await page.goto('/workbench.html?open')
    await pickMode(page)
    await page.locator('.rail .rk').nth(1).locator('svg path').click({ force: true })
    expect(await chip(page)).toMatch(/^svg/)
    await ui(page, '.inspector .target [aria-label="Select parent"]').click()
    expect(await chip(page)).toBe('button "Rooms"')
  })

  test('P08 native modal dialog: pick by shortcut inside it, Escape cancels Smegglect first', async ({ page }) => {
    await page.click('#open-dialog')
    await expect(page.locator('#dialog')).toBeVisible()
    // Escape while picking ends the pick mode; the host dialog does not see it.
    await page.keyboard.press('Alt+Shift+P')
    await page.keyboard.press('Escape')
    await expect(page.locator('#dialog')).toBeVisible()
    await expect(ui(page, '.dock [aria-label="Pick element"]')).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('Alt+Shift+P')
    await page.click('#dialog-ok')
    expect(await chip(page)).toBe('button "OK"')
    await expect(page.locator('#dialog')).toBeVisible()
    const host = await page.evaluate(() => {
      const el = document.querySelector('smegglect-root')!
      const dialogOpen = (document.getElementById('dialog') as HTMLDialogElement).open
      return { open: el.matches(':popover-open'), dialogOpen }
    })
    expect(host).toEqual({ open: true, dialogOpen: true })
  })

  test('P09 a region keeps its document position when the page scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 400 })
    await ui(page, '.dock [aria-label="Draw region"]').click()
    await page.mouse.move(100, 100)
    await page.mouse.down()
    await page.mouse.move(260, 180, { steps: 4 })
    await page.mouse.up()
    expect(await chip(page)).toBe('Region')
    const before = await ui(page, '.guides .region').boundingBox()
    await page.evaluate(() => window.scrollBy(0, 60))
    await settle(page)
    const after = await ui(page, '.guides .region').boundingBox()
    expect(Math.round(before!.y - after!.y)).toBe(60)
  })
})

test('P05 open shadow content is selectable; P06 closed roots and frames are boundaries', async ({ page }) => {
  await page.goto('/boundaries.html')
  await expect(ui(page, '.dock')).toBeVisible()
  await pickMode(page)
  await page.locator('#shadow-btn').click()
  expect(await chip(page)).toBe('button "Shadow button"')
  await pickMode(page)
  await page.locator('#closed-host').click()
  expect(await chip(page)).toBe('closed-card')
  await expect(ui(page, '.inspector .target .notice')).toContainText('This component hides')
  await pickMode(page)
  await page.locator('#canvas').click({ position: { x: 150, y: 112 } })
  expect(await chip(page)).toBe('canvas')
  await expect(ui(page, '.inspector .target .notice')).toContainText('Canvas content')
  await pickMode(page)
  const frame = page.locator('#frame')
  const box = (await frame.boundingBox())!
  await page.mouse.move(box.x + 5, box.y - 5)
  await page.mouse.move(box.x + 30, box.y + 20, { steps: 5 })
  await settle(page)
  await page.mouse.click(box.x + 30, box.y + 20)
  expect(await chip(page)).toBe('iframe')
  await expect(ui(page, '.inspector .target .notice')).toContainText('Frame content')
})

test('P01 pointerdown-driven host handlers do not run while picking', async ({ page }) => {
  await page.goto('/boundaries.html')
  await pickMode(page)
  await page.click('#toggle')
  expect(await page.getAttribute('#toggle', 'aria-pressed')).toBe('false')
  expect(await chip(page)).toBe('button "Toggle"')
})

test.describe('vue host', () => {
  test('P07 teleported menu and CSS dialog content can be picked', async ({ page }) => {
    await page.goto('/vue.html?open')
    await page.click('#open-menu')
    await pickMode(page)
    await page.locator('#menu [role=menuitem]').nth(1).click()
    expect(await chip(page)).toBe('button (menuitem) "Duplicate"')
    await expect(page.locator('#menu')).toBeVisible()
  })

  test('P10 repeated rows keep their own identity through reorder and removal', async ({ page }) => {
    await page.goto('/vue.html?open')
    await pickMode(page)
    await page.locator('.item-row').nth(1).locator('.remove').click()
    expect(await chip(page)).toBe('button "Remove"')
    await preset(page, 'clipped')
    await expect(ui(page, '.dock [aria-label^="Issues"] .badge')).toHaveText('1')
    const pinOn = async () => {
      await settle(page)
      const mark = (await ui(page, '.guides.marks rect.mark').boundingBox())!
      const pin = { x: mark.x - 9, y: mark.y - 9 }
      const rows = await page.locator('.item-row').evaluateAll(els => els.map(e => ({ name: e.querySelector('.name')!.textContent, y: e.getBoundingClientRect().y, h: e.getBoundingClientRect().height })))
      return rows.find(r => pin.y + 9 >= r.y && pin.y + 9 <= r.y + r.h)?.name
    }
    expect(await pinOn()).toBe('Desk')
    // The inspector moved left, over the toolbar; closing it keeps the selection and the issue.
    await ui(page, '.inspector [aria-label="Close inspector"]').click()
    await page.click('#shuffle')
    expect(await pinOn()).toBe('Desk')
    const resolved = await page.evaluate(async () => {
      const dom = (window as unknown as { smegglectDom: typeof import('../../src/dom/index') }).smegglectDom
      const btn = [...document.querySelectorAll('.item-row')].find(r => r.textContent?.includes('Desk'))!.querySelector('.remove')!
      const d = dom.describe(btn)
      const first = dom.resolve(document, d)
      const desk = [...document.querySelectorAll('.item-row')].find(r => r.textContent?.includes('Desk'))!
      desk.remove()
      const gone = dom.resolve(document, d)
      return { first: first.status === 'resolved' && first.element === btn, gone: gone.status }
    })
    expect(resolved).toEqual({ first: true, gone: 'unavailable' })
  })
})

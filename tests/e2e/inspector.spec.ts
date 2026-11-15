// tests/e2e/inspector.spec.ts
// The inspector: opening on a selection, closing, Escape, a phone-sized drawer.
import { expect, test, type Page } from '@playwright/test'
import { action, pick, preset, settle, ui } from './helpers'

type Box = { x: number, y: number, width: number, height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const box = async (page: Page, selector: string) => (await ui(page, selector).boundingBox())!
const state = (page: Page) => page.evaluate(() => {
  const s = window.sg!.engine.state()
  return { mode: s.inspect.mode.kind, selection: s.inspect.selection.kind }
})

test.beforeEach(async ({ page }) => {
  await page.goto('/plain.html?open&memory')
})

test('picking opens the inspector on the selected element', async ({ page }) => {
  await expect(ui(page, '.inspector')).toHaveCount(0)
  await pick(page, '#cancel')
  await expect(ui(page, '.inspector')).toBeVisible()
  await expect(ui(page, '.inspector .target .name')).toHaveText('button "Cancel"')
  await expect(ui(page, '.inspector .target .dims')).toHaveText('71.5 x 40')
})

test('closing the inspector keeps the selection, and the next pick opens it again', async ({ page }) => {
  await pick(page, '#cancel')
  await ui(page, '.inspector [aria-label="Close inspector"]').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
  await expect(ui(page, '.guides .a')).toHaveCount(1)
  await pick(page, '#submit')
  await expect(ui(page, '.inspector .target .name')).toHaveText('button "Save order"')
})

test('Escape with focus in a host field leaves the inspector open', async ({ page }) => {
  await pick(page, '#cancel')
  await page.keyboard.press('Escape')
  expect(await state(page)).toEqual({ mode: 'pass', selection: 'none' })
  await page.locator('#customer').focus()
  await page.keyboard.press('Escape')
  await expect(ui(page, '.inspector')).toBeVisible()
})

test('the Element tab shows live measurements of the selection', async ({ page }) => {
  await pick(page, '#box-a')
  await ui(page, '.inspector [data-tree="measure"] [data-node="measurements"]').click()
  const value = (id: string) => ui(page, `.inspector [data-node="measure:${id}"] .tree-meta`)
  await expect(value('size')).toHaveText('124.5 x 44')
  await expect(value('border')).toHaveText('2')
  await expect(value('padding')).toHaveText('0')
  await page.locator('#box-a').evaluate(el => ((el as HTMLElement).style.padding = '8px 4px'))
  await expect(value('padding')).toHaveText('8 4')
  await expect(value('background')).toHaveText(/^#[0-9a-f]{6}$/)
})

test('on a phone the drawer opens from the toolbar, of one height also while waiting for B', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await pick(page, '#submit')
  await settle(page)
  const drawer = await box(page, '.inspector')
  expect(drawer.width).toBeGreaterThan(300)
  expect(overlaps(drawer, await box(page, '.dock'))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await (await action(page, 'match-height')).click()
  await settle(page)
  expect((await box(page, '.inspector')).height).toBe(drawer.height)
  await expect(ui(page, '.inspector .waiting')).toContainText('Pick B')
})

test('a plate opens its issue again after the inspector was closed', async ({ page }) => {
  await pick(page, '#clip')
  await preset(page, 'clipped')
  await ui(page, '.plate .plate-main').click()
  await expect(ui(page, '.inspector .issue-view')).toBeVisible()
  await ui(page, '.inspector [aria-label="Close inspector"]').click()
  await ui(page, '.plate .plate-main').click()
  await expect(ui(page, '.inspector .issue-view')).toBeVisible()
})

test('with an issue open, Pick then Escape or Cancel ends pick mode and keeps the issue', async ({ page }) => {
  await pick(page, '#clip')
  await preset(page, 'clipped')
  await ui(page, '.plate .plate-main').click()
  await ui(page, '.dock [aria-label="Pick element"]').click()
  await page.keyboard.press('Escape')
  expect((await state(page)).mode).toBe('pass')
  await expect(ui(page, '.inspector .issue-view')).toBeVisible()
  await ui(page, '.dock [aria-label="Pick element"]').click()
  await ui(page, '.inspector .waiting button').click()
  expect((await state(page)).mode).toBe('pass')
  await expect(ui(page, '.inspector .issue-view')).toBeVisible()
})

test('leaving the Element tab ends the step for B', async ({ page }) => {
  await pick(page, '#cancel')
  await (await action(page, 'match-height')).click()
  // While waiting the header offers only Cancel; leaving the Element tab from the dock also ends the step.
  await expect(ui(page, '.inspector [aria-label="Close inspector"]')).toHaveCount(0)
  await ui(page, '.dock [aria-label^="Issues"]').click()
  expect((await state(page)).mode).toBe('pass')
  await page.evaluate(() => window.events.splice(0))
  await page.locator('#express').click()
  expect(await page.isChecked('#express')).toBe(true)
  expect(await page.evaluate(() => window.sg!.engine.state().composing)).toBeNull()
})

test('the panel never covers the dock at 1024 and 760 px', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await pick(page, '#clip')
  await preset(page, 'clipped')
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'Issues' }).click()
  await settle(page)
  expect(overlaps(await box(page, '.inspector'), await box(page, '.dock'))).toBe(false)
  await page.setViewportSize({ width: 760, height: 700 })
  await settle(page)
  await settle(page)
  expect(overlaps(await box(page, '.inspector'), await box(page, '.dock'))).toBe(false)
})

test('a note typed in the issue view is kept when leaving with Escape', async ({ page }) => {
  await pick(page, '#clip')
  await preset(page, 'clipped')
  await ui(page, '.plate .plate-main').click()
  await ui(page, '.issue-view textarea').fill('Keep the full text in a tooltip')
  await page.keyboard.press('Escape')
  await expect(ui(page, '.inspector .issue-view')).toHaveCount(0)
  expect(await page.evaluate(() => window.sg!.engine.state().drafts.issues[0]!.intent.note)).toBe('Keep the full text in a tooltip')
})

for (const [w, h] of [[1280, 800], [1024, 768]] as const) {
  test(`the dock never moves or changes when the inspector opens (${w})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.reload()
    await settle(page)
    const before = await box(page, '.dock')
    const captions = await ui(page, '.dock .caption').count()
    await pick(page, '#clip')
    await preset(page, 'clipped')
    await ui(page, '.dock [aria-label^="Issues"]').click()
    await expect(ui(page, '.inspector [data-tree="issues"] [data-issue]')).toHaveCount(1)
    await settle(page)
    expect(await box(page, '.dock')).toEqual(before)
    expect(await ui(page, '.dock .caption').count()).toBe(captions)
    expect(overlaps(await box(page, '.inspector'), before)).toBe(false)
  })
}

test('the rarer issue types sit in folded groups under More and export their own task sentence', async ({ page }) => {
  await pick(page, '#submit')
  await expect(ui(page, '.inspector [data-node="group:access"]')).toHaveAttribute('aria-expanded', 'false')
  await preset(page, 'state-missing')
  await pick(page, '#submit')
  await preset(page, 'responsive')
  const md = await page.evaluate(() => window.sg!.engine.session.markdown(window.sg!.engine.session.draftBatch()))
  expect(md).toContain('missing a visible state')
  expect(md).toContain('breaks at another screen size')
})

test('folds keep what the person chose across tabs and selections', async ({ page }) => {
  await pick(page, '#cancel')
  await ui(page, '.inspector [data-node="group:look"]').click()
  await ui(page, '.inspector [data-node="group:size"]').click()
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'Issues' }).click()
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'Element' }).click()
  await pick(page, '#submit')
  await expect(ui(page, '.inspector [data-node="group:look"]')).toHaveAttribute('aria-expanded', 'true')
  await expect(ui(page, '.inspector [data-node="group:size"]')).toHaveAttribute('aria-expanded', 'false')
})

test('empty states say what the place is for and offer the next step', async ({ page }) => {
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector .empty h3')).toHaveText('No issues yet')
  await ui(page, '.inspector .empty .tile').click()
  expect((await state(page)).mode).toBe('pick')
  await page.locator('#cancel').click()
  await expect(ui(page, '.inspector .target .name')).toHaveText('button "Cancel"')
})

test('the tabs are S99AB\'s strip: the open one opens into the panel, its icon in the accent; arrows move between them', async ({ page }) => {
  await ui(page, '.dock [aria-label^="Issues"]').click()
  const tab = ui(page, '.inspector .tabstrip button[aria-selected="true"]')
  await expect(tab).toContainText('Issues')
  const look = (selector: string) => ui(page, selector).first().evaluate((el) => {
    const style = getComputedStyle(el)
    return { bg: style.backgroundColor, shadow: style.boxShadow, icon: getComputedStyle(el.querySelector('svg')!).fill }
  })
  const panel = await ui(page, '.inspector').first().evaluate(el => getComputedStyle(el).backgroundColor)
  const accent = await ui(page, '.sg').first().evaluate((el) => {
    const probe = document.createElement('i')
    probe.style.color = 'var(--sg-select)'
    el.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  const open = await look('.inspector .tabstrip button[aria-selected="true"]')
  const closed = await look('.inspector .tabstrip button[aria-selected="false"]')
  // In front: the panel's face, a side line either side and no floor. Behind: the strip's floor line.
  expect(open.bg).toBe(panel)
  expect(open.shadow).toMatch(/1px 0px 0px 0px, .*-1px 0px 0px 0px$/)
  expect(open.shadow).not.toContain('inset')
  expect(open.icon).toBe(accent)
  expect(closed.shadow).toMatch(/0px -1px 0px 0px inset$/)
  expect(closed.icon).not.toBe(accent)
  await tab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(ui(page, '.inspector .tabstrip button[aria-selected="true"]')).toContainText('History')
})

test('the trees walk with the arrow keys and open branches with Right', async ({ page }) => {
  await pick(page, '#cancel')
  const first = ui(page, '.inspector [data-tree="actions"] [role="treeitem"]').first()
  await first.focus()
  await page.keyboard.press('ArrowDown')
  await expect(ui(page, '.inspector [data-tree="actions"] [data-preset="size"]')).toBeFocused()
  await ui(page, '.inspector [data-node="group:look"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(ui(page, '.inspector [data-node="group:look"]')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(ui(page, '.inspector [data-tree="actions"] [data-preset="readability"]')).toHaveAttribute('aria-selected', 'true')
})

test('building a group shows one line, the member count and a single Done', async ({ page }) => {
  await pick(page, '#cancel')
  const size = (await box(page, '.inspector')).height
  await ui(page, '.inspector .target [aria-label="Add to group with each pick"]').click()
  await page.locator('#submit').click()
  const header = ui(page, '.inspector .waiting')
  await expect(header).toContainText('Click elements to add or remove')
  await expect(header.locator('.members')).toHaveText('2 elements')
  await expect(header.locator('button')).toHaveCount(1)
  await expect(header.locator('button')).toHaveText('Done')
  await expect(ui(page, '.inspector [aria-label="Close inspector"]')).toHaveCount(0)
  expect((await box(page, '.inspector')).height).toBe(size)
  await header.locator('button').click()
  expect((await state(page)).mode).toBe('pass')
})

test('a group lists its members as a tree with their sizes; hovering one marks it on the page', async ({ page }) => {
  await pick(page, '#cancel')
  await pick(page, '#submit', { shift: true })
  await page.keyboard.press('Escape')
  const members = ui(page, '.inspector [data-tree="members"] [data-node^="member:"]')
  await expect(members).toHaveCount(2)
  await expect(members.first()).toContainText('button "Cancel"')
  await expect(members.first().locator('.tree-meta')).toHaveText('71.5 x 40')
  await members.nth(1).hover()
  await expect(ui(page, '.guides .member-on')).toHaveCount(1)
})

test('a member leaves the group by the X on its row or by Delete; the last but one leaves a plain selection', async ({ page }) => {
  await pick(page, '#cancel')
  await pick(page, '#submit', { shift: true })
  await pick(page, 'h1', { shift: true })
  await page.keyboard.press('Escape')
  const members = ui(page, '.inspector [data-tree="members"] [data-node^="member:"]')
  await expect(members).toHaveCount(3)
  // Always shown, muted until its row is pointed at.
  const x = members.nth(1).getByRole('button', { name: 'Remove from group' })
  await page.mouse.move(5, 5)
  await expect(x).toBeVisible()
  const quiet = await x.evaluate(el => getComputedStyle(el).color)
  await members.nth(1).hover()
  await expect.poll(() => x.evaluate(el => getComputedStyle(el).color)).not.toBe(quiet)
  await x.click()
  await expect(members).toHaveCount(2)
  await expect(members.nth(1)).toContainText('h1')
  await expect(ui(page, '.guides .member-on')).toHaveCount(0)
  await expect(ui(page, '.guides .member')).toHaveCount(2)
  await members.first().focus()
  await page.keyboard.press('Delete')
  await expect(ui(page, '.inspector [data-tree="members"]')).toHaveCount(0)
  await expect(ui(page, '.inspector .target .name')).toContainText('h1')
  expect(await state(page)).toEqual({ mode: 'pass', selection: 'dom' })
  const focused = await page.evaluate(() => document.querySelector('smegglect-root')!.shadowRoot!.activeElement?.closest('.compose') !== null)
  expect(focused).toBe(true)
})

test('each member\'s size stays whole and inside its row next to a long name', async ({ page }) => {
  // The drawer opens beside the toolbar: on the left edge it leaves the middle of the page free.
  await page.evaluate(() => window.sg!.update({ placement: 'left' }))
  await page.evaluate(() => {
    const wide = document.createElement('div')
    wide.id = 'wide'
    wide.setAttribute('aria-label', 'A container whose accessible name is long enough to be shortened')
    wide.style.cssText = 'width: 1234.56px; height: 567.89px'
    document.body.append(wide)
  })
  await pick(page, '#evil')
  await pick(page, '#wide', { shift: true })
  await page.keyboard.press('Escape')
  const rows = ui(page, '.inspector [data-tree="members"] [data-node^="member:"]')
  await expect(rows).toHaveCount(2)
  for (const row of await rows.all()) {
    const fit = await row.evaluate((el) => {
      const meta = el.querySelector('.tree-meta')!
      const m = meta.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return { whole: meta.scrollWidth <= meta.clientWidth, inside: m.left >= r.left && m.right <= r.right }
    })
    expect(fit).toEqual({ whole: true, inside: true })
  }
})

test('sections carry no counts: groups, members, issues by page, reported here', async ({ page }) => {
  await pick(page, '#cancel')
  await pick(page, '#submit', { shift: true })
  await page.keyboard.press('Escape')
  await preset(page, 'note', { note: 'Spacing' })
  // Headings are names alone: no number beside "Reported here", the group or the page.
  await expect(ui(page, '.inspector .here .section')).toHaveText('Reported here')
  await expect(ui(page, '.inspector [data-tree="members"] .tree-row.branch .tree-name').first()).toHaveText('Elements')
  await ui(page, '.inspector .tabstrip [role="tab"]').nth(1).click()
  await expect(ui(page, '.inspector [data-tree="issues"] [data-issue]')).toHaveCount(1)
  await expect(ui(page, '.inspector [data-tree="issues"] [data-page] .tree-name')).toHaveText('This page')
})


test('pointing is blue and dashed with a wash; selecting is solid red with a halo; counts are readable pills', async ({ page }) => {
  await pick(page, '#cancel')
  await ui(page, '.dock [aria-label="Pick element"]').click()
  await page.locator('#submit').hover()
  await settle(page)
  const look = await page.evaluate(() => {
    const sr = document.querySelector('smegglect-root')!.shadowRoot!
    const css = (sel: string) => getComputedStyle(sr.querySelector(sel)!)
    const root = getComputedStyle(sr.querySelector('.sg')!)
    return {
      hover: { stroke: css('.guides .cand').stroke, dash: css('.guides .cand').strokeDasharray, fill: css('.guides .cand').fill },
      sel: { stroke: css('.guides .a').stroke, dash: css('.guides .a').strokeDasharray, halo: !!sr.querySelector('.guides .a-halo') },
      ref: root.getPropertyValue('--sg-ref').trim(),
    }
  })
  expect(look.hover.dash).not.toBe('none')
  expect(look.hover.fill).not.toBe('none')
  expect(look.sel.dash).toBe('none')
  expect(look.sel.halo).toBe(true)
  expect(look.hover.stroke).not.toBe(look.sel.stroke)
  await page.keyboard.press('Escape')
  // The one count left is the toolbar's Issues key.
  await page.evaluate(() => window.sg!.engine.apply('note', {}, 'Count me'))
  const count = ui(page, '.dock [data-tool="issues"] .badge')
  const pill = await count.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, weight: getComputedStyle(el).fontWeight }))
  expect(pill.bg).not.toBe('rgba(0, 0, 0, 0)')
  expect(Number(pill.weight)).toBeGreaterThanOrEqual(600)
})

test('a tooltip goes away when its button is pressed and disappears', async ({ page }) => {
  await pick(page, '#cancel')
  await ui(page, '.dock [aria-label="Pick element"]').click()
  const cancel = ui(page, '.inspector .waiting button')
  await cancel.hover()
  await expect(ui(page, '.tip')).toBeVisible()
  await cancel.click()
  await expect(ui(page, '.inspector .waiting')).toHaveCount(0)
  await expect(ui(page, '.tip')).toHaveCount(0)
})

test('the line from an issue\'s A to its B never takes a click meant for the page', async ({ page }) => {
  await pick(page, '#cancel')
  await preset(page, 'match-height', { b: '#submit' })
  const line = ui(page, '.guides.marks line')
  await expect(line).toHaveCount(1)
  expect(await line.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none')
  await pick(page, '#submit')
  await expect(ui(page, '.inspector .target .name')).toHaveText('button "Save order"')
})

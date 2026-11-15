// tests/e2e/perf.spec.ts
// Overhead on a dense page. Runs with SMEGGLECT_PERF=1; prints and stores numbers, asserts only budgets.
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

test.skip(!process.env.SMEGGLECT_PERF, 'set SMEGGLECT_PERF=1 to measure')

interface Sample { frames: number, p95: number, max: number, longTasks: number, longTaskMs: number, heapMb: number }

async function sweep(page: Page): Promise<Sample> {
  await page.evaluate(() => {
    const w = window as unknown as { perf: { t: number[], long: number[] } }
    w.perf = { t: [], long: [] }
    new PerformanceObserver(list => list.getEntries().forEach(e => w.perf.long.push(e.duration))).observe({ type: 'longtask', buffered: false })
    const tick = (t: number) => {
      w.perf.t.push(t)
      if (w.perf.t.length < 400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  for (let i = 0; i < 120; i++) await page.mouse.move(40 + (i * 37) % 1100, 40 + (i * 53) % 700)
  await page.waitForFunction(() => (window as unknown as { perf: { t: number[] } }).perf.t.length >= 400)
  return page.evaluate(() => {
    const { t, long } = (window as unknown as { perf: { t: number[], long: number[] } }).perf
    const d = t.slice(1).map((v, i) => v - (t[i] as number)).sort((a, b) => a - b)
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    return {
      frames: d.length,
      p95: Math.round((d[Math.floor(d.length * 0.95)] ?? 0) * 10) / 10,
      max: Math.round((d.at(-1) ?? 0) * 10) / 10,
      longTasks: long.length,
      longTaskMs: Math.round(long.reduce((a, b) => a + b, 0)),
      heapMb: mem ? Math.round(mem.usedJSHeapSize / 1e5) / 10 : -1,
    }
  })
}

test('baseline, mounted-inactive and active inspection on 6000+ nodes', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'longtask and memory APIs are Chromium-only')
  await page.goto('/dense.html')
  await page.waitForFunction(() => !!(window as unknown as { smegglect?: unknown }).smegglect)
  const nodes = await page.evaluate(() => document.querySelectorAll('*').length)
  const baseline = await sweep(page)
  await page.evaluate(() => {
    (window as unknown as { sg: unknown }).sg = (window as unknown as { smegglect: { mount: (o: object) => unknown } }).smegglect.mount({ project: { id: 'perf' }, storage: 'memory' })
  })
  const inactive = await sweep(page)
  await page.evaluate(() => {
    const sg = (window as unknown as { sg: { engine: { setExpanded: (b: boolean) => void, togglePick: () => void, setMeasuring: (b: boolean) => void } } }).sg
    sg.engine.setExpanded(true)
    sg.engine.togglePick()
    sg.engine.setMeasuring(true)
  })
  await page.mouse.click(300, 200)
  const active = await sweep(page)
  const result = { nodes, viewport: page.viewportSize(), baseline, inactive, active, browser: browserName }
  console.log(JSON.stringify(result, null, 1))
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/perf.json', JSON.stringify(result, null, 2))
  // Budgets set from the measured numbers.
  expect(inactive.longTasks).toBe(0)
  expect(active.longTasks).toBe(0)
  expect(active.p95).toBeLessThan(40)
})

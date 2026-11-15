// tests/bridge/feed.test.ts
// The loop between page, broker and agent: open work, the page channel, live checks, `wait`.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch } from '../../src/core/model'
import { startBroker, type Broker } from '../../src/bridge/server'
import { issue } from '../../src/core/validate.test'

const ORIGIN = 'http://127.0.0.1:5199'

interface Work { batch_id: string, issue_id: string, task: string, target: string }
/** Response bodies as the tests read them. */
type Body = { open: Work[], seq: number, events: { kind: string, id: string, request: unknown }[] } & Record<string, unknown>
const brokers: Broker[] = []

async function broker(): Promise<{ b: Broker, root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'sg-feed-'))
  const b = await startBroker({ root, origins: [ORIGIN], log: () => {} })
  brokers.push(b)
  return { b, root }
}

afterEach(async () => {
  await Promise.all(brokers.splice(0).map(b => b.close()))
})

function batch(id = 'bat_feed1'): Batch {
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id, project: { id: 'demo' }, window: { id: 'win_1' },
    status: 'submitted', createdAt: '2026-11-14T00:00:00Z', submittedAt: '2026-11-14T01:00:00Z',
    issues: [issue({ id: 'iss_one', status: 'submitted' }), issue({ id: 'iss_two', seq: 2, status: 'submitted' })],
    attachments: [],
  }
}

/** A page names itself on the page channel and when it answers a check. */
function asPage(path: string, page: string): string {
  if (!/^\/v1\/(page\/next|checks\/)/.test(path)) return path
  return `${path}${path.includes('?') ? '&' : '?'}page=${page}`
}

/** A page call carries the admitted Origin; an agent call carries none. */
function call(b: Broker, method: string, path: string, opts: { page?: boolean, body?: unknown, id?: string } = {}) {
  const target = opts.page ? asPage(path, opts.id ?? 'win_test') : path
  return fetch(`${b.url}${target}`, {
    method,
    headers: {
      authorization: `Bearer ${b.token}`,
      ...(opts.page ? { origin: ORIGIN } : {}),
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  }).then(async res => ({ status: res.status, body: (res.status === 204 ? {} : await res.json()) as Body }))
}

const result = (issueId: string, id: string) => ({ id, batchId: 'bat_feed1', issueId, kind: 'result', actor: 'agent', state: 'needs-review', text: 'done', createdAt: '2026-11-14T02:00:00Z' })
const reopen = (issueId: string) => ({ id: 'rev_re', batchId: 'bat_feed1', issueId, kind: 'review', actor: 'human', state: 'reopened', reason: 'still-happens', text: 'Still 2px off on the right', createdAt: '2026-11-14T03:00:00Z' })

describe('open work', () => {
  it('lists sent issues until the agent reports; a page cannot record a follow-up', async () => {
    const { b } = await broker()
    expect((await call(b, 'POST', '/v1/batches', { page: true, body: batch() })).status).toBe(201)
    let work = (await call(b, 'GET', '/v1/work')).body.open
    expect(work.map(w => w.issue_id)).toEqual(['iss_one', 'iss_two'])
    await call(b, 'POST', '/v1/batches/bat_feed1/followups', { body: result('iss_one', 'res_1') })
    work = (await call(b, 'GET', '/v1/work')).body.open
    expect(work.map(w => w.issue_id)).toEqual(['iss_two'])
    expect((await call(b, 'POST', '/v1/batches/bat_feed1/followups', { page: true, body: reopen('iss_two') })).status).toBe(403)
    expect((await call(b, 'GET', '/v1/work')).body.open.map(w => w.issue_id)).toEqual(['iss_two'])
  })

  it('a waiting request returns as soon as work arrives, or empty when the wait ends', async () => {
    const { b } = await broker()
    const t0 = Date.now()
    expect((await call(b, 'GET', '/v1/work?wait=1')).body.open).toEqual([])
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900)
    const waiting = call(b, 'GET', '/v1/work?wait=10')
    setTimeout(() => void call(b, 'POST', '/v1/batches', { page: true, body: batch() }), 200)
    const t1 = Date.now()
    expect((await waiting).body.open).toHaveLength(2)
    expect(Date.now() - t1).toBeLessThan(3000)
  })
})

describe('page channel', () => {
  it('gives a cursor first, then the events after it, waiting until one arrives; pages only', async () => {
    const { b } = await broker()
    await call(b, 'POST', '/v1/batches', { page: true, body: batch() })
    const first = (await call(b, 'GET', '/v1/page/next', { page: true })).body
    expect(first.events).toEqual([])
    const waiting = call(b, 'GET', `/v1/page/next?after=${first.seq}&wait=10`, { page: true })
    setTimeout(() => void call(b, 'POST', '/v1/batches/bat_feed1/followups', { body: result('iss_two', 'res_2') }), 200)
    // An agent's first call also says it is there: a status event, which may come in a poll of its own.
    let next = (await waiting).body
    const seen = [...next.events]
    while (!seen.some(e => e.kind === 'results')) {
      next = (await call(b, 'GET', `/v1/page/next?after=${next.seq}&wait=10`, { page: true })).body
      seen.push(...next.events)
    }
    expect(seen.filter(e => e.kind !== 'status')).toEqual([
      expect.objectContaining({ kind: 'results', batchId: 'bat_feed1' }),
    ])
    expect(next.seq).toBeGreaterThan(first.seq)
    expect((await call(b, 'GET', '/v1/page/next')).status).toBe(403)
  })
})

/** Answers every check the page channel delivers, as an open page would. */
function page(b: Broker, answer: (request: { kind: string }) => unknown) {
  let stop = false
  // Ends quietly when the broker closes under an open poll, as the real page does.
  void (async () => {
    let after = (await call(b, 'GET', '/v1/page/next', { page: true })).body.seq
    while (!stop) {
      const res = (await call(b, 'GET', `/v1/page/next?after=${after}&wait=2`, { page: true })).body
      after = res.seq
      for (const e of res.events) if (e.kind === 'check') await call(b, 'POST', `/v1/checks/${e.id}`, { page: true, body: answer(e.request as { kind: string }) })
    }
  })().catch(() => {})
  return () => (stop = true)
}

describe('closing', () => {
  it('ends open long-polls at once instead of waiting for them', async () => {
    const { b } = await broker()
    const cursor = (await call(b, 'GET', '/v1/page/next', { page: true })).body.seq
    const polling = call(b, 'GET', `/v1/page/next?after=${cursor}&wait=20`, { page: true }).catch(() => 'ended')
    const working = call(b, 'GET', '/v1/work?wait=20').catch(() => 'ended')
    await new Promise(done => setTimeout(done, 100))
    const t0 = Date.now()
    await b.close()
    expect(Date.now() - t0).toBeLessThan(2000)
    await Promise.all([polling, working])
  })
})

describe('checks', () => {
  it('the agent asks, an open page answers; without a page the answer is no-page', async () => {
    const { b } = await broker()
    await call(b, 'POST', '/v1/batches', { page: true, body: batch() })
    const ask = { kind: 'issue', batchId: 'bat_feed1', issueId: 'iss_one' }
    expect(await call(b, 'POST', '/v1/checks', { body: ask })).toEqual({ status: 409, body: { error: 'no-page' } })
    const close = page(b, request => ({ status: 'live', echo: request }))
    try {
      await new Promise(done => setTimeout(done, 100))
      expect(await call(b, 'POST', '/v1/checks', { body: ask })).toEqual({
        status: 200,
        body: { status: 'live', echo: ask, answeredBy: { page: 'win_test', sentTheBatch: false } },
      })
      expect((await call(b, 'POST', '/v1/checks', { page: true, body: ask })).status).toBe(403)
      expect((await call(b, 'POST', '/v1/checks', { body: { kind: 'issue', batchId: '../x', issueId: 'iss_one' } })).status).toBe(422)
      expect((await call(b, 'POST', '/v1/checks/chk_unknown', { body: {} })).status).toBe(403)
      expect((await call(b, 'POST', '/v1/checks/chk_unknown', { page: true, body: {} })).status).toBe(404)
    }
    finally {
      close()
    }
  })
})

interface Seen {
  checks: string[]
  stop: () => void
}

/** A page with an id and a viewport that answers the checks put to it, after `delay` ms. */
function pageAt(b: Broker, id: string, options: { width: number, focused?: boolean, observer?: boolean, delay?: number }): Seen {
  const seen: Seen = { checks: [], stop: () => {} }
  let stop = false
  seen.stop = () => (stop = true)
  const flags = `&visible=1${options.focused ? '&focused=1' : ''}${options.observer ? '&observer=1' : ''}`
  void (async () => {
    let after = (await call(b, 'GET', `/v1/page/next?page=${id}${flags}`)).body.seq
    while (!stop) {
      const res = (await call(b, 'GET', `/v1/page/next?page=${id}${flags}&after=${after}&wait=2`, { page: true, id })).body
      after = res.seq
      for (const e of res.events) {
        if (e.kind !== 'check') continue
        seen.checks.push(e.id)
        await new Promise(done => setTimeout(done, options.delay ?? 0))
        const conditions = { viewport: { width: options.width, height: 800 }, devicePixelRatio: 1, colorScheme: 'light' }
        await call(b, 'POST', `/v1/checks/${e.id}`, { page: true, id, body: { status: 'live', conditions } })
      }
    }
  })().catch(() => {})
  return seen
}

describe('which page answers', () => {
  it('asks the page that sent the batch first and returns its answer, with its viewport', async () => {
    const { b } = await broker()
    await call(b, 'POST', '/v1/batches', { page: true, body: batch() })
    // The sender (win_1, in batch().window) is slower and not focused; the other page is quick and focused.
    const sender = pageAt(b, 'win_1', { width: 768, delay: 300 })
    const other = pageAt(b, 'win_phone', { width: 390, focused: true })
    try {
      await new Promise(done => setTimeout(done, 150))
      const res = await call(b, 'POST', '/v1/checks', { body: { kind: 'issue', batchId: 'bat_feed1', issueId: 'iss_one' } })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        status: 'live',
        conditions: { viewport: { width: 768 } },
        answeredBy: { page: 'win_1', sentTheBatch: true },
      })
      // With no sender open, the focused page answers.
      sender.stop()
      await new Promise(done => setTimeout(done, 5200))
      const next = await call(b, 'POST', '/v1/checks', { body: { kind: 'selection' } })
      expect(next.body).toMatchObject({ conditions: { viewport: { width: 390 } }, answeredBy: { page: 'win_phone' } })
    }
    finally {
      sender.stop()
      other.stop()
    }
  }, 15_000)

  it('never asks an observer page', async () => {
    const { b } = await broker()
    await call(b, 'POST', '/v1/batches', { page: true, body: batch() })
    const observer = pageAt(b, 'win_robot', { width: 1280, observer: true })
    try {
      await new Promise(done => setTimeout(done, 150))
      // An observer alone is no page to ask.
      expect((await call(b, 'POST', '/v1/checks', { body: { kind: 'selection' } })).status).toBe(409)
      const real = pageAt(b, 'win_1', { width: 768 })
      await new Promise(done => setTimeout(done, 150))
      const res = await call(b, 'POST', '/v1/checks', { body: { kind: 'issue', batchId: 'bat_feed1', issueId: 'iss_one' } })
      expect(res.body).toMatchObject({ answeredBy: { page: 'win_1' } })
      real.stop()
      expect(observer.checks).toEqual([])
      expect((await call(b, 'POST', '/v1/checks/chk_any', { page: true, id: 'win_robot', body: {} })).status).toBe(404)
    }
    finally {
      observer.stop()
    }
  })
})

describe('MCP tools for the loop', () => {
  it('next_work, check_issue and get_selection go through the broker and the page', async () => {
    const { b, root } = await broker()
    await call(b, 'POST', '/v1/batches', { page: true, body: batch() })
    const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/bridge-cli.js', 'mcp', '--root', root], stderr: 'pipe' })
    const client = new Client({ name: 'smegglect-test', version: '1' })
    await client.connect(transport)
    const tool = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await client.callTool({ name, arguments: args }) as { content: { text: string }[], isError?: boolean }
      return { text: res.content[0]?.text ?? '', isError: !!res.isError }
    }
    try {
      const names = (await client.listTools()).tools.map(t => t.name).sort()
      expect(names).toEqual(['check_issue', 'get_attachment', 'get_batch', 'get_issue_evidence', 'get_selection', 'list_batches', 'next_work', 'report_result'])
      const work = JSON.parse((await tool('next_work')).text)
      expect((work.open as Work[]).map(w => w.issue_id)).toEqual(['iss_one', 'iss_two'])
      const none = await tool('check_issue', { batch_id: 'bat_feed1', issue_id: 'iss_one' })
      expect(none.isError).toBe(true)
      expect(none.text).toMatch(/no page/i)
      const close = page(b, request => request.kind === 'selection' ? { status: 'live', target: 'button "Save"' } : { status: 'live', changes: [] })
      try {
        await new Promise(done => setTimeout(done, 100))
        const checked = JSON.parse((await tool('check_issue', { batch_id: 'bat_feed1', issue_id: 'iss_one' })).text)
        expect(checked).toMatchObject({ status: 'live', changes: [] })
        expect(checked.note).toMatch(/untrusted/)
        expect(JSON.parse((await tool('get_selection')).text)).toMatchObject({ status: 'live', target: 'button "Save"' })
      }
      finally {
        close()
      }
    }
    finally {
      await client.close()
    }
  })
})

describe('wait', () => {
  it('blocks until a batch is sent, prints what is open and exits', async () => {
    const { b, root } = await broker()
    const child = spawn(process.execPath, ['dist/bridge-cli.js', 'wait', '--root', root], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    const exited = new Promise<number | null>(done => child.on('exit', code => done(code)))
    await new Promise(done => setTimeout(done, 500))
    expect(child.exitCode).toBe(null)
    await call(b, 'POST', '/v1/batches', { page: true, body: batch() })
    expect(await exited).toBe(0)
    expect(out).toContain('2 open issues')
    expect(out).toContain('next_work')
  })

  it('waits for the bridge to come up when it is not running yet', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sg-feed-'))
    const child = spawn(process.execPath, ['dist/bridge-cli.js', 'wait', '--root', root], { stdio: ['ignore', 'pipe', 'pipe'] })
    const exited = new Promise<number | null>(done => child.on('exit', code => done(code)))
    await new Promise(done => setTimeout(done, 500))
    expect(child.exitCode).toBe(null)
    const b = await startBroker({ root, origins: [ORIGIN], log: () => {} })
    brokers.push(b)
    await call(b, 'POST', '/v1/batches', { page: true, body: batch() })
    expect(await exited).toBe(0)
  })
})

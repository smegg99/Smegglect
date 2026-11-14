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

interface Work { batchId: string, issueId: string, state: string, said?: string[] }
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

/** A page call carries the admitted Origin; an agent call carries none. */
function call(b: Broker, method: string, path: string, opts: { page?: boolean, body?: unknown } = {}) {
  return fetch(`${b.url}${path}`, {
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
  it('lists sent issues until the agent reports, then a reopened one with what the person said', async () => {
    const { b } = await broker()
    expect((await call(b, 'POST', '/v1/batches', { page: true, body: batch() })).status).toBe(201)
    let work = (await call(b, 'GET', '/v1/work')).body.open
    expect(work.map(w => [w.issueId, w.state])).toEqual([['iss_one', 'submitted'], ['iss_two', 'submitted']])
    await call(b, 'POST', '/v1/batches/bat_feed1/followups', { body: result('iss_one', 'res_1') })
    work = (await call(b, 'GET', '/v1/work')).body.open
    expect(work.map(w => w.issueId)).toEqual(['iss_two'])
    await call(b, 'POST', '/v1/batches/bat_feed1/followups', { page: true, body: reopen('iss_one') })
    work = (await call(b, 'GET', '/v1/work')).body.open
    expect(work[0]).toMatchObject({ batchId: 'bat_feed1', issueId: 'iss_one', state: 'reopened', said: ['still-happens: Still 2px off on the right'] })
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
    const next = (await waiting).body
    expect(next.events).toEqual([{ seq: first.seq + 1, kind: 'results', batchId: 'bat_feed1', actor: 'agent' }])
    expect(next.seq).toBe(first.seq + 1)
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
      expect(await call(b, 'POST', '/v1/checks', { body: ask })).toEqual({ status: 200, body: { status: 'live', echo: ask } })
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
      expect(names).toEqual(['check_issue', 'get_batch', 'get_issue_evidence', 'get_selection', 'list_batches', 'next_work', 'report_result'])
      const work = JSON.parse((await tool('next_work')).text)
      expect((work.open as Work[]).map(w => w.issueId)).toEqual(['iss_one', 'iss_two'])
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

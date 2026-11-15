// tests/bridge/bridge.test.ts
// The bridge against a real broker and a real MCP stdio client. Needs `just build` first (spawns dist/bridge-cli.js).
import { mkdtempSync, readFileSync, statSync, symlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch } from '../../src/core/model'
import { startBroker, type Broker } from '../../src/bridge/server'
import { issue } from '../../src/core/validate.test'

const ORIGIN = 'http://127.0.0.1:5199'
let root: string
let broker: Broker

function raw(path: string, opts: { method?: string, headers?: Record<string, string>, body?: string | Buffer } = {}): Promise<{ status: number, headers: Record<string, unknown>, body: string }> {
  const url = new URL(broker.url)
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port: url.port, path, method: opts.method ?? 'GET', headers: opts.headers ?? {} }, (res) => {
      let data = ''
      res.on('data', c => (data += c))
      res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body: data }))
    })
    req.on('error', fail)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

const auth = () => ({ authorization: `Bearer ${broker.token}` })

function batch(id = 'bat_test1'): Batch {
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id, project: { id: 'demo' }, window: { id: 'win_1' },
    status: 'submitted', createdAt: '2026-11-14T00:00:00Z', submittedAt: '2026-11-14T01:00:00Z',
    issues: [issue({ id: 'iss_one', status: 'submitted' }), issue({ id: 'iss_two', seq: 2, status: 'submitted' })],
    attachments: [],
  }
}

const post = (path: string, value: unknown, headers: Record<string, string> = {}) =>
  raw(path, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) })

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sg-bridge-'))
  broker = await startBroker({ root, origins: [ORIGIN], log: () => {} })
})

afterAll(async () => {
  await broker?.close()
})

describe('access control', () => {
  it('requires the exact token, loopback host and an allowed origin', async () => {
    expect((await raw('/v1/health')).status).toBe(401)
    expect((await raw('/v1/health', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
    expect((await raw('/v1/health', { headers: { ...auth(), host: 'evil.test' } })).status).toBe(421)
    expect((await raw('/v1/health', { headers: { ...auth(), origin: 'http://evil.test' } })).status).toBe(403)
    const ok = await raw('/v1/health', { headers: { ...auth(), origin: ORIGIN } })
    expect(ok.status).toBe(200)
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN)
    const pre = await raw('/v1/batches', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST' } })
    expect(pre.status).toBe(204)
    expect(pre.headers['access-control-allow-origin']).toBe(ORIGIN)
    expect((await raw('/v1/batches', { method: 'OPTIONS', headers: { origin: 'null' } })).status).toBe(403)
  })

  it('keeps the token out of the store except the 0600 connection file', () => {
    const info = join(root, '.smegglect', 'bridge.json')
    expect(statSync(info).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(info, 'utf8')).token).toBe(broker.token)
  })

  it('exposes no arbitrary file, shell or evaluation route', async () => {
    for (const path of ['/v1/files', '/v1/exec', '/v1/eval', '/etc/passwd', '/v1/batches/../../etc/passwd']) {
      expect((await raw(path, { headers: auth() })).status).toBe(404)
    }
  })
})

describe('bounded input and containment', () => {
  it('rejects traversal ids, wrong content types and oversized bodies', async () => {
    expect((await raw('/v1/batches/..%2F..%2Fetc', { headers: auth() })).status).toBe(404)
    expect((await post('/v1/batches', { ...batch(), id: '../escape' })).status).toBe(422)
    expect((await raw('/v1/batches', { method: 'POST', headers: { ...auth(), 'content-type': 'text/plain' }, body: '{}' })).status).toBe(415)
    expect((await raw('/v1/batches', { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: 'x'.repeat(2 * 1024 * 1024 + 10) })).status).toBe(413)
    expect((await post('/v1/batches', { ...batch(), status: 'draft' })).status).toBe(422)
    expect(existsSync(join(root, 'escape'))).toBe(false)
  })

  it('refuses a symlinked batch directory', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'sg-outside-'))
    symlinkSync(outside, join(root, '.smegglect', 'batches', 'bat_linked'))
    expect((await raw('/v1/batches/bat_linked', { headers: auth() })).status).toBe(400)
  })
})

describe('MCP round trip', () => {
  let client: Client
  let stderr = ''

  beforeAll(async () => {
    expect((await post('/v1/batches', batch(), { origin: ORIGIN })).status).toBe(201)
    expect((await post('/v1/batches', batch(), { origin: ORIGIN })).status).toBe(200)
    expect((await post('/v1/batches', { ...batch(), issues: [batch().issues[0]] }, { origin: ORIGIN })).status).toBe(409)
    const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/bridge-cli.js', 'mcp', '--root', root], stderr: 'pipe' })
    transport.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    client = new Client({ name: 'smegglect-test', version: '1' })
    await client.connect(transport)
  })

  afterAll(async () => {
    await client?.close()
  })

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args }) as { content: { text: string }[], isError?: boolean }
    return { text: res.content[0]?.text ?? '', isError: !!res.isError }
  }

  it('reports the package version as the server version', () => {
    expect(client.getServerVersion()?.version).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version)
  })

  it('lists the tools and only submitted batches', async () => {
    const tools = (await client.listTools()).tools.map(t => t.name).sort()
    expect(tools).toEqual(['check_issue', 'get_attachment', 'get_batch', 'get_issue_evidence', 'get_selection', 'list_batches', 'next_work', 'report_result'])
    const list = JSON.parse((await call('list_batches')).text)
    expect(list.map((b: { id: string }) => b.id)).toEqual(['bat_test1'])
    expect(list[0].issues.map((i: { state: string }) => i.state)).toEqual(['submitted', 'submitted'])
  })

  it('returns summaries first and evidence on demand, labelled untrusted', async () => {
    const summary = JSON.parse((await call('get_batch', { batch_id: 'bat_test1' })).text)
    expect(summary.issues[0].task).toContain('Make the height of A match the height of B')
    expect(summary.issues[0].evidence).toBeUndefined()
    const ev = JSON.parse((await call('get_issue_evidence', { batch_id: 'bat_test1', issue_id: 'iss_one' })).text)
    expect(ev.note).toMatch(/untrusted/)
    expect(ev.issue.evidence.a.bounds).toBeDefined()
    expect((await call('get_issue_evidence', { batch_id: 'bat_test1', issue_id: 'iss_nope' })).isError).toBe(true)
  })

  it('records results idempotently; an agent cannot accept', async () => {
    const r = await call('report_result', { batch_id: 'bat_test1', issue_id: 'iss_one', state: 'needs-review', summary: 'Matched heights through the shared token', files: ['src/App.vue'], checks: [{ command: 'bun run typecheck', outcome: 'passed' }], result_id: 'r1' })
    expect(r.text).toMatch(/^recorded res_r1 as needs-review/)
    expect((await call('report_result', { batch_id: 'bat_test1', issue_id: 'iss_one', state: 'needs-review', summary: 'Matched heights through the shared token', files: ['src/App.vue'], checks: [{ command: 'bun run typecheck', outcome: 'passed' }], result_id: 'r1' })).text).toBe('already recorded res_r1')
    const accept = await client.callTool({ name: 'report_result', arguments: { batch_id: 'bat_test1', issue_id: 'iss_one', state: 'accepted', summary: 'done' } }) as { isError?: boolean }
    expect(accept.isError).toBe(true)
    // A process without an Origin cannot post a human review either.
    expect((await post('/v1/batches/bat_test1/followups', { id: 'rev_x', batchId: 'bat_test1', issueId: 'iss_one', kind: 'review', actor: 'human', state: 'accepted', text: '', createdAt: 'x' })).status).toBe(403)
    const follow = JSON.parse((await raw('/v1/batches/bat_test1/followups', { headers: auth() })).body)
    expect(follow.filter((f: { id: string }) => f.id === 'res_r1')).toHaveLength(1)
    const original = JSON.parse((await raw('/v1/batches/bat_test1', { headers: auth() })).body)
    expect(original).toEqual(JSON.parse(JSON.stringify(batch())))
  })

  it('takes no review from a page; the latest agent result is the state', async () => {
    expect((await post('/v1/batches/bat_test1/followups', { id: 'rev_ok', batchId: 'bat_test1', issueId: 'iss_one', kind: 'review', actor: 'human', state: 'accepted', text: '', createdAt: '2026-11-14T02:00:00Z' }, { origin: ORIGIN })).status).toBe(403)
    await call('report_result', { batch_id: 'bat_test1', issue_id: 'iss_one', state: 'blocked', result_id: 'late' })
    const list = JSON.parse((await call('list_batches')).text)
    expect(list[0].issues[0].state).toBe('blocked')
  })

  it('keeps diagnostics off stdout and reports a stopped broker honestly', async () => {
    expect(stderr).not.toContain(broker.token)
    await broker.close()
    const r = await call('list_batches')
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/not running/)
  })
})

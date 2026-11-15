// tests/bridge/errors.test.ts
// A bridge that fails says so: a refusal with its status, never an empty answer, and `wait` ends with it.
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { brokerClient } from '../../src/bridge/client'
import * as operations from '../../src/bridge/operations'
import { startBroker } from '../../src/bridge/server'
import { createRegistry } from '../../src/core/presets'

const run = promisify(execFile)
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

/** A bridge that answers every request with a 500, as one whose store fails would. */
async function failingBridge(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'sg-errors-'))
  const server: Server = createServer((_req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'internal' }))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  mkdirSync(join(root, '.smegglect'), { recursive: true })
  const file = { url: `http://127.0.0.1:${port}`, token: 't', pid: process.pid }
  writeFileSync(join(root, '.smegglect', 'bridge.json'), JSON.stringify(file), { mode: 0o600 })
  cleanups.push(() => new Promise(done => server.close(() => done())))
  return root
}

describe('a bridge that fails', () => {
  it('is a refusal with its status, not an empty list or a missing batch', async () => {
    const client = brokerClient(await failingBridge())
    const refusal = { ok: false, reason: 'the bridge answered 500 (internal)' }
    expect(await operations.listBatches(client)).toEqual(refusal)
    expect(await operations.nextWork(client)).toEqual(refusal)
    expect(await operations.getBatch(client, createRegistry(), 'bat_x')).toEqual(refusal)
    expect(await operations.issueEvidence(client, 'bat_x', 'iss_x')).toEqual(refusal)
  })

  it('ends `wait` with what it answered instead of waiting on in silence', async () => {
    const root = await failingBridge()
    const waiting = run(process.execPath, ['dist/bridge-cli.js', 'wait', '--root', root])
    await expect(waiting).rejects.toMatchObject({ code: 1 })
    const { stderr } = await waiting.catch((error: { stderr: string }) => error)
    expect(stderr).toContain('the bridge answered 500 internal')
  })
})

describe('an answer without a body', () => {
  it('a hello the broker takes resolves, though its 204 carries nothing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sg-errors-'))
    const broker = await startBroker({ root, origins: [], log: () => {} })
    cleanups.push(() => broker.close())
    const client = brokerClient(root, { id: 'mcp_hello', client: 'claude-code' })
    expect(await client.post('/v1/agents/hello', {})).toEqual({ status: 204, body: null })
  })
})

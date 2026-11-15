// tests/bridge/images.test.ts
// An image the person attached and approved reaches the agent by path and by tool; a pending one never does.
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Attachment, type Batch } from '../../src/core/model'
import { startBroker, type Broker } from '../../src/bridge/server'
import { issue } from '../../src/core/validate.test'

const ORIGIN = 'http://127.0.0.1:5199'
/** A 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

let root: string
let broker: Broker
let client: Client

function attachment(id: string, review: Attachment['review']): Attachment {
  return {
    id, issueId: 'iss_one', name: `${id}.png`, mime: 'image/png', size: PNG.length, review,
    createdAt: '2026-11-15T00:00:00Z',
  }
}

function batch(): Batch {
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_images', project: { id: 'demo' }, window: { id: 'win_1' },
    status: 'submitted', createdAt: '2026-11-15T00:00:00Z', submittedAt: '2026-11-15T01:00:00Z',
    issues: [
      issue({ id: 'iss_one', status: 'submitted', attachments: ['att_shown', 'att_held'] }),
      issue({ id: 'iss_two', seq: 2, status: 'submitted' }),
    ],
    attachments: [attachment('att_shown', 'approved'), attachment('att_held', 'pending')],
  }
}

const asPage = (path: string, init: { method: string, type: string, body: string | Uint8Array<ArrayBuffer> }) => fetch(
  `${broker.url}${path}`,
  {
    method: init.method,
    headers: { 'authorization': `Bearer ${broker.token}`, 'origin': ORIGIN, 'content-type': init.type },
    body: init.body,
  },
)

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args })
  return res as { content: { type: string, text?: string, data?: string, mimeType?: string }[], isError?: boolean }
}
const json = async (name: string, args: Record<string, unknown> = {}) => {
  return JSON.parse((await call(name, args)).content[0]?.text ?? 'null')
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sg-images-'))
  broker = await startBroker({ root, origins: [ORIGIN], log: () => {} })
  const sent = await asPage('/v1/batches', { method: 'POST', type: 'application/json', body: JSON.stringify(batch()) })
  expect(sent.status).toBe(201)
  const put = (id: string) => asPage(`/v1/batches/bat_images/attachments/${id}`, {
    method: 'PUT', type: 'image/png', body: new Uint8Array(PNG),
  })
  expect((await put('att_shown')).status).toBe(201)
  // The page never uploads a pending image; the broker refuses one anyway.
  expect((await put('att_held')).status).toBe(422)
  client = new Client({ name: 'smegglect-test', version: '1' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ['dist/bridge-cli.js', 'mcp', '--root', root],
    stderr: 'ignore',
  }))
})

afterAll(async () => {
  await client?.close()
  await broker?.close()
})

describe('approved images', () => {
  it('get_batch and the evidence list the approved image with a path under the bridge root', async () => {
    const path = '.smegglect/batches/bat_images/attachments/att_shown.png'
    const summary = await json('get_batch', { batch_id: 'bat_images' })
    expect(summary.issues[0].images).toEqual([{ id: 'att_shown', mime: 'image/png', size: PNG.length, path }])
    expect(summary.issues[1].images).toEqual([])
    const evidence = await json('get_issue_evidence', { batch_id: 'bat_images', issue_id: 'iss_one' })
    expect(evidence.images).toEqual([{ id: 'att_shown', mime: 'image/png', size: PNG.length, path }])
    expect(readFileSync(join(root, path)).equals(PNG)).toBe(true)
  })

  it('get_attachment returns the image itself, and says it was approved and is not redacted', async () => {
    const tools = (await client.listTools()).tools
    const description = tools.find(tool => tool.name === 'get_attachment')?.description ?? ''
    expect(description).toMatch(/approved/)
    expect(description).toMatch(/not redacted/)
    const res = await call('get_attachment', { batch_id: 'bat_images', attachment_id: 'att_shown' })
    expect(res.isError).toBeFalsy()
    const image = res.content.find(part => part.type === 'image')
    expect(image?.mimeType).toBe('image/png')
    expect(Buffer.from(image?.data ?? '', 'base64').equals(PNG)).toBe(true)
  })

  it('the work list counts the images of each issue', async () => {
    const work = await json('next_work', { claim: false })
    expect(work.open.map((item: { images: number }) => item.images)).toEqual([1, 0])
  })

  it('a pending image is neither listed nor returned, by tool or command', async () => {
    const res = await call('get_attachment', { batch_id: 'bat_images', attachment_id: 'att_held' })
    expect(res.isError).toBe(true)
    expect(res.content.some(part => part.type === 'image')).toBe(false)
    const listed = JSON.stringify(await json('get_batch', { batch_id: 'bat_images' }))
    expect(listed).not.toContain('att_held')
    const run = promisify(execFile)
    const shown = await run(process.execPath, ['dist/bridge-cli.js', 'attachment', 'bat_images', 'att_shown', '--root', root])
    expect(shown.stdout.trim()).toBe(join(root, '.smegglect/batches/bat_images/attachments/att_shown.png'))
    const held = run(process.execPath, ['dist/bridge-cli.js', 'attachment', 'bat_images', 'att_held', '--root', root])
    await expect(held).rejects.toMatchObject({ code: 1 })
  })
})

// tests/bridge/store.test.ts
// The store on its own: records parsed again on read, ids kept whole, and of two writes at once only one wins.
import { existsSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Attachment, type Batch, type FollowUp } from '../../src/core/model'
import { createRegistry } from '../../src/core/presets'
import { openStore } from '../../src/bridge/store'
import { issue } from '../../src/core/validate.test'

const registry = createRegistry()
/** Ids a secret pattern matches: 64 hex digits, and a long run of mixed case and digits. */
const HEX = 'a1b2c3d4'.repeat(8)
const MIXED = 'Ab3'.repeat(13)

function batch(over: Partial<Batch> = {}): Batch {
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_store', project: { id: 'demo' }, window: { id: 'win_1' },
    status: 'submitted', createdAt: '2026-11-14T00:00:00Z', submittedAt: '2026-11-14T01:00:00Z',
    issues: [issue({ id: 'iss_one', status: 'submitted' }), issue({ id: 'iss_two', seq: 2, status: 'submitted' })],
    attachments: [],
    ...over,
  }
}

const result = (over: Partial<FollowUp> = {}): FollowUp => ({
  id: 'res_1', batchId: 'bat_store', issueId: 'iss_one', kind: 'result', actor: 'agent', state: 'needs-review',
  text: 'done', createdAt: '2026-11-14T02:00:00Z', ...over,
})

async function opened() {
  const root = mkdtempSync(join(tmpdir(), 'sg-store-'))
  const store = await openStore(root, registry)
  return { root, store, dir: join(root, '.smegglect', 'batches', 'bat_store') }
}

describe('follow-ups', () => {
  it('a retry with a new time is the same result, and the first one stays', async () => {
    const { store } = await opened()
    expect(await store.putBatch(batch())).toBe('stored')
    expect(await store.addFollowUp(result())).toBe('stored')
    expect(await store.addFollowUp(result({ createdAt: '2026-11-14T03:00:00Z' }))).toBe('duplicate')
    expect(await store.addFollowUp(result({ state: 'blocked', createdAt: '2026-11-14T03:00:00Z' }))).toBe('conflict')
    expect((await store.followUps('bat_store')).map(f => f.createdAt)).toEqual(['2026-11-14T02:00:00Z'])
  })

  it('a malformed record on disk is skipped; the listing and the issue state still hold', async () => {
    const { store, dir } = await opened()
    await store.putBatch(batch())
    await store.addFollowUp(result())
    const write = (id: string, text: string) => writeFileSync(join(dir, 'followups', `${id}.json`), text)
    write('res_notime', JSON.stringify({ ...result({ id: 'res_notime' }), createdAt: undefined }))
    write('res_checks', JSON.stringify({ ...result({ id: 'res_checks' }), checks: 'all of them' }))
    write('res_torn', '{"id": "res_torn"')
    write('res_elsewhere', JSON.stringify(result({ id: 'res_other' })))
    const listed = await store.listBatches()
    expect(listed.map(summary => summary.issues.map(item => item.state))).toEqual([['needs-review', 'submitted']])
    expect((await store.followUps('bat_store')).map(f => f.id)).toEqual(['res_1'])
    const record = await store.issue('bat_store', 'iss_one')
    expect(record?.followUps).toEqual([{ id: 'res_1', kind: 'result', actor: 'agent', state: 'needs-review', text: 'done', createdAt: '2026-11-14T02:00:00Z' }])
  })
})

describe('ids', () => {
  it('a long random id stays whole: the batch, its project, an issue and a result are found by it', async () => {
    const { store } = await opened()
    const issueId = `iss_${MIXED}`
    const long = batch({ project: { id: HEX }, issues: [issue({ id: issueId, status: 'submitted' })] })
    expect(await store.putBatch(long)).toBe('stored')
    const stored = await store.getBatch('bat_store')
    expect(stored?.project.id).toBe(HEX)
    expect(stored?.issues[0]?.id).toBe(issueId)
    expect(await store.addFollowUp(result({ id: `res_${MIXED}`, issueId, text: `token ${HEX}` }))).toBe('stored')
    expect((await store.followUps('bat_store')).map(f => [f.id, f.text])).toEqual([[`res_${MIXED}`, 'token [redacted]']])
  })
})

describe('attachments', () => {
  const attachment = (mime: string): Attachment => ({
    id: 'att_1', issueId: 'iss_one', name: 'shot.png', mime, size: 3, review: 'approved', createdAt: '2026-11-14T00:00:00Z',
  })
  const withImage = (mime: string) => batch({
    issues: [issue({ id: 'iss_one', status: 'submitted', attachments: ['att_1'] })],
    attachments: [attachment(mime)],
  })

  it('takes only the image types it knows, by their own name', async () => {
    const { store } = await opened()
    for (const mime of ['constructor', 'toString', 'text/html']) expect(await store.putBatch(withImage(mime))).toBe('invalid')
    expect(await store.putBatch(withImage('image/png'))).toBe('stored')
    expect(await store.putAttachment('bat_store', 'att_1', 'constructor', new Uint8Array(3))).toBe('invalid')
    expect(await store.putAttachment('bat_store', 'att_1', 'image/png', new Uint8Array(3))).toBe('stored')
    expect(await store.putAttachment('bat_store', 'att_1', 'image/png', new Uint8Array(3))).toBe('duplicate')
    expect((await store.attachment('bat_store', 'att_1'))?.mime).toBe('image/png')
  })
})

describe('writes at the same time', () => {
  it('of two different batches under one id, one is stored and the other conflicts', async () => {
    const { store, dir } = await opened()
    const other = batch({ issues: [batch().issues[0]!] })
    expect((await Promise.all([store.putBatch(batch()), store.putBatch(other)])).sort()).toEqual(['conflict', 'stored'])
    expect((await Promise.all([store.putBatch(batch()), store.putBatch(batch())]))).not.toContain('stored')
    expect(readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([])
  })

  it('of two different results under one id, one is stored and the other conflicts', async () => {
    const { store, dir } = await opened()
    await store.putBatch(batch())
    const both = await Promise.all([store.addFollowUp(result()), store.addFollowUp(result({ state: 'blocked' }))])
    expect(both.sort()).toEqual(['conflict', 'stored'])
    const same = await Promise.all([store.addFollowUp(result({ id: 'res_2' })), store.addFollowUp(result({ id: 'res_2' }))])
    expect(same.sort()).toEqual(['duplicate', 'stored'])
    expect(readdirSync(join(dir, 'followups')).filter(name => name.endsWith('.tmp'))).toEqual([])
  })
})

describe('opening the store', () => {
  it('removes the temporary files a stopped broker left, and leaves one being written now', async () => {
    const { root, store, dir } = await opened()
    await store.putBatch(batch())
    const left = [join(dir, 'batch.json.0a1b2c3d4e5f.tmp'), join(root, '.smegglect', 'bridge.json.1a2b3c4d.tmp')]
    const fresh = join(dir, 'followups', 'res_9.json.abcdef012345.tmp')
    const hourAgo = new Date(Date.now() - 3_600_000)
    for (const file of [...left, fresh]) writeFileSync(file, '{}')
    for (const file of left) utimesSync(file, hourAgo, hourAgo)
    await openStore(root, registry)
    expect(left.filter(file => existsSync(file))).toEqual([])
    expect(existsSync(fresh)).toBe(true)
    expect(existsSync(join(dir, 'batch.json'))).toBe(true)
  })
})

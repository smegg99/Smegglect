// src/dom/bridge.test.ts
import { describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch } from '../core/model'
import { issue } from '../core/validate.test'
import { bridgeClient, type BridgeRequest } from './bridge'

const win = globalThis as Window & typeof globalThis

function batch(): Batch {
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_via1', project: { id: 'demo' }, window: { id: 'win_1' },
    status: 'submitted', createdAt: '2026-11-14T00:00:00Z', submittedAt: '2026-11-14T01:00:00Z',
    issues: [issue({ id: 'iss_one', status: 'submitted' })],
    attachments: [{ id: 'att_1', issueId: 'iss_one', name: 'shot.png', mime: 'image/png', size: 3, review: 'approved', createdAt: '2026-11-14T00:00:00Z' }],
  }
}

describe('bridgeClient through the app', () => {
  it('hands every request to the app, attachments as base64, and reads its answers', async () => {
    const seen: BridgeRequest[] = []
    const client = bridgeClient(win, {
      label: 'Desk',
      via: async (request) => {
        seen.push(request)
        return request.path === '/v1/batches' ? { status: 201, body: '{}' } : { status: 204, body: '' }
      },
    })
    expect([client.url, client.label]).toEqual([null, 'Desk'])
    expect(await client.putBatch(batch(), new Map([['att_1', new Blob([new Uint8Array([0, 255, 7])])]]))).toBe('stored')
    expect(seen.map(r => [r.method, r.path, r.type, r.base64 ?? false])).toEqual([
      ['POST', '/v1/batches', 'application/json', false],
      ['PUT', '/v1/batches/bat_via1/attachments/att_1', 'image/png', true],
    ])
    expect(JSON.parse(seen[0]!.body!).id).toBe('bat_via1')
    expect(seen[1]!.body).toBe('AP8H')
  })

  it('treats a failed call or status 0 as offline', async () => {
    const client = bridgeClient(win, { label: 'Desk', via: () => Promise.reject(new Error('no broker')) })
    expect(await client.health()).toBe(null)
    expect(await client.putBatch(batch(), new Map())).toBe('offline')
    expect(await bridgeClient(win, { label: 'Desk', via: async () => ({ status: 503, body: '' }) }).listIds()).toBe(null)
    // The app says no broker is running without failing the call.
    expect(await bridgeClient(win, { label: 'Desk', via: async () => ({ status: 0, body: '' }) }).putBatch(batch(), new Map())).toBe('offline')
  })

  it('reads a successful reply that is not the broker\'s JSON as no answer', async () => {
    const client = bridgeClient(win, { label: 'Desk', via: async () => ({ status: 200, body: '<html>' }) })
    const poll = { id: 'win_page', visible: true, focused: true, observer: false }
    expect(await client.health()).toBe(null)
    expect(await client.listIds()).toBe(null)
    expect(await client.status()).toBe(null)
    expect(await client.batch('bat_via1')).toBe(null)
    expect(await client.next(null, poll, new AbortController().signal)).toBe(null)
    const odd = bridgeClient(win, { label: 'Desk', via: async () => ({ status: 200, body: '{"seq":"x"}' }) })
    expect(await odd.next(null, poll, new AbortController().signal)).toBe(null)
  })

  it('reports an image the broker did not store instead of calling the batch stored', async () => {
    const files = new Map([['att_1', new Blob([new Uint8Array([1])])]])
    const refused = bridgeClient(win, {
      label: 'Desk',
      via: async request => request.method === 'POST' ? { status: 201, body: '{}' } : { status: 422, body: '{}' },
    })
    expect(await refused.putBatch(batch(), files)).toBe('invalid')
    const gone = bridgeClient(win, {
      label: 'Desk',
      via: async request => request.method === 'POST' ? { status: 200, body: '{}' } : { status: 0, body: '' },
    })
    expect(await gone.putBatch(batch(), files)).toBe('offline')
  })

  it('passes the abort signal on, so a closed page ends its poll', async () => {
    let signal: AbortSignal | undefined
    const client = bridgeClient(win, { label: 'Desk', via: (_r, s) => new Promise((_done, fail) => {
      signal = s
      s?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')))
    }) })
    const stop = new AbortController()
    const polling = client.next(3, { id: 'win_page', visible: true, focused: true, observer: false }, stop.signal)
    stop.abort()
    expect(await polling).toBe(null)
    expect(signal?.aborted).toBe(true)
  })
  it('a status without per-issue progress still reads, and unknown words are dropped', async () => {
    const reply = (body: unknown) => bridgeClient(win, {
      label: 'Desk', via: async () => ({ status: 200, body: JSON.stringify(body) }),
    }).status()
    const agent = { listening: false, kind: null, lastSeenAgo: null }
    const old = await reply({ agent, batches: {} })
    expect(old).not.toBe(null)
    expect(old?.issues).toBeUndefined()
    expect((await reply({ agent, batches: {}, issues: 'x' }))?.issues).toBeUndefined()
    const odd = await reply({ agent, batches: {}, issues: { bat_b: { iss_i: 'exploded', iss_j: 'taken' }, bat_c: 7 } })
    expect(odd?.issues).toEqual({ bat_b: { iss_j: 'taken' } })
    // The per-report words too.
    expect((await reply({ agent, batches: { bat_b: 'done', bat_c: 'exploded' } }))?.batches).toEqual({ bat_b: 'done' })
  })
})

describe('bridgeClient direct', () => {
  it('only calls the loopback address', () => {
    expect(() => bridgeClient(win, { url: 'http://localhost:4000', token: 't' })).toThrow(/127\.0\.0\.1/)
    expect(bridgeClient(win, { url: 'http://127.0.0.1:4000', token: 't' }).label).toBe(null)
  })

})

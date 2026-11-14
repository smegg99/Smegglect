// src/dom/bridge.ts
// Browser side of the optional local bridge. The token travels in a header only, never in a URL.

import type { Numbered } from '../core/feed'
import type { Batch, FollowUp } from '../core/model'

export interface BridgeConfig {
  url: string
  token: string
}

export type BridgeResult = 'stored' | 'duplicate' | 'conflict' | 'invalid' | 'offline'

export interface BridgeClient {
  readonly url: string
  health: () => Promise<boolean>
  listIds: () => Promise<string[] | null>
  putBatch: (batch: Batch, files: Map<string, Blob>) => Promise<BridgeResult>
  followUps: (batchId: string) => Promise<FollowUp[] | null>
  addFollowUp: (f: FollowUp) => Promise<BridgeResult>
  /** A sent batch as the bridge holds it, e.g. one sent from another browser. */
  batch: (id: string) => Promise<Batch | null>
  /** Long-poll of the page channel: events after the cursor, or the current cursor when it is null. */
  next: (after: number | null, signal: AbortSignal) => Promise<{ seq: number, events: Numbered[] } | null>
  /** The page's answer to an agent's check. */
  answer: (id: string, value: unknown) => Promise<boolean>
}

/** Seconds the broker holds a page poll open when nothing happens. */
const POLL_S = 25

const RESULT: Record<number, BridgeResult> = { 200: 'duplicate', 201: 'stored', 409: 'conflict', 422: 'invalid' }

export function bridgeClient(win: Window & typeof globalThis, config: BridgeConfig): BridgeClient {
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(config.url)) throw new Error('smegglect: bridge url must be http://127.0.0.1:<port>')
  const headers = { authorization: `Bearer ${config.token}` }
  async function call(method: string, path: string, body?: BodyInit, type?: string, signal?: AbortSignal): Promise<Response | null> {
    try {
      return await win.fetch(`${config.url}${path}`, { method, headers: type ? { ...headers, 'content-type': type } : headers, ...(body ? { body } : {}), ...(signal ? { signal } : {}), credentials: 'omit' })
    }
    catch {
      return null
    }
  }
  return {
    url: config.url,
    async health() {
      return (await call('GET', '/v1/health'))?.ok === true
    },
    async listIds() {
      const res = await call('GET', '/v1/batches')
      if (!res?.ok) return null
      return ((await res.json()) as { id: string }[]).map(b => b.id)
    },
    async putBatch(batch, files) {
      const res = await call('POST', '/v1/batches', JSON.stringify(batch), 'application/json')
      if (!res) return 'offline'
      const result = RESULT[res.status] ?? 'invalid'
      if (result !== 'stored' && result !== 'duplicate') return result
      for (const a of batch.attachments) {
        const blob = files.get(a.id)
        if (blob) await call('PUT', `/v1/batches/${batch.id}/attachments/${a.id}`, blob, a.mime)
      }
      return result
    },
    async followUps(batchId) {
      const res = await call('GET', `/v1/batches/${batchId}/followups`)
      return res?.ok ? (await res.json()) as FollowUp[] : null
    },
    async addFollowUp(f) {
      const res = await call('POST', `/v1/batches/${f.batchId}/followups`, JSON.stringify(f), 'application/json')
      return res ? RESULT[res.status] ?? 'invalid' : 'offline'
    },
    async batch(id) {
      const res = await call('GET', `/v1/batches/${encodeURIComponent(id)}`)
      return res?.ok ? (await res.json()) as Batch : null
    },
    async next(after, signal) {
      const res = await call('GET', after === null ? '/v1/page/next' : `/v1/page/next?after=${after}&wait=${POLL_S}`, undefined, undefined, signal)
      return res?.ok ? (await res.json()) as { seq: number, events: Numbered[] } : null
    },
    async answer(id, value) {
      const res = await call('POST', `/v1/checks/${encodeURIComponent(id)}`, JSON.stringify(value), 'application/json')
      return res?.status === 204
    },
  }
}

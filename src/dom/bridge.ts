// src/dom/bridge.ts
// Browser side of the optional local bridge. The token travels in a header only, never in a URL.

import type { Numbered, PagePoll } from '../core/feed'
import type { Batch } from '../core/model'
import { ISSUE_PROGRESS, type IssueProgress } from '../core/review'
import { checkBatch } from '../core/validate'
import { base64 } from './base64'
import type { HostWindow } from './window'

/** What every bridge configuration may say. */
interface BridgeCommon {
  /** This page never answers an agent's checks: a second browser an automation opens on the dev server. */
  observer?: boolean
}

/** The broker's address and token, for a page that may call it directly (a dev server page). */
export interface BridgeAddress extends BridgeCommon {
  url: string
  token: string
}

/** One request to the broker, as a page that reaches it through its app hands it over. */
export interface BridgeRequest {
  method: 'GET' | 'POST' | 'PUT'
  /** Starts with `/v1/`, query included. */
  path: string
  body?: string
  type?: string
  /** `body` is base64, e.g. an attached image. */
  base64?: boolean
}

/**
 * Sends one request through the app (a desktop window's native side), which adds the token;
 * aborting cancels it. Status 0 means no broker is running.
 */
export type BridgeTransport = (
  request: BridgeRequest,
  signal?: AbortSignal,
) => Promise<{ status: number, body: string }>

/** For a page that cannot or should not call the broker itself: its app forwards every request. */
export interface BridgeVia extends BridgeCommon {
  /** Names the app in the bridge status line. */
  label: string
  via: BridgeTransport
}

export type BridgeConfig = BridgeAddress | BridgeVia

export type BridgeResult = 'stored' | 'duplicate' | 'conflict' | 'invalid' | 'offline'

/** Words about the agent, from calls it makes anyway; never its own text. */
/** How far a sent batch has got: waiting for an agent, taken, stalled, or done. */
export type BatchProgress = 'waiting' | 'taken' | 'stalled' | 'done'
const BATCH_PROGRESS: readonly BatchProgress[] = ['waiting', 'taken', 'stalled', 'done']

export interface BridgeStatus {
  agent: { listening: boolean, kind: 'claude' | 'other' | null, lastSeenAgo: number | null }
  batches: Record<string, BatchProgress>
  /** Per sent batch, then issue: how far the agent has got. Absent from a broker older than this page. */
  issues?: Record<string, Record<string, IssueProgress>>
}

/** What the broker says about itself. */
export interface BridgeHealth {
  version: string
  /** The bridge root: the folder its store and the agent's MCP server meet in. */
  root: string
}

export interface BridgeClient {
  /** Where the broker is, for a page that calls it directly. */
  readonly url: string | null
  /** The app that forwards to it, for a page that does not. */
  readonly label: string | null
  /** Set by the mount option; never answers checks. */
  readonly observer: boolean
  /** The broker's version and the folder it serves; null when it does not answer. */
  health: () => Promise<BridgeHealth | null>
  listIds: () => Promise<string[] | null>
  putBatch: (batch: Batch, files: Map<string, Blob>) => Promise<BridgeResult>
  /** A sent batch as the bridge holds it, e.g. one sent from another browser. */
  batch: (id: string) => Promise<Batch | null>
  /** Long-poll of the page channel: events after the cursor, or the current cursor when it is null. */
  next: (
    after: number | null,
    poll: PagePoll,
    signal: AbortSignal,
  ) => Promise<{ seq: number, events: Numbered[] } | null>
  /** Whether an agent listens and how far each sent batch has got; null when the bridge does not answer. */
  status: () => Promise<BridgeStatus | null>
  /** The page's answer to an agent's check put to it. */
  answer: (id: string, page: string, value: unknown) => Promise<boolean>
}

/** Seconds the broker holds a page poll open when nothing happens. */
const POLL_S = 25

const RESULT: Record<number, BridgeResult> = {
  200: 'duplicate',
  201: 'stored',
  409: 'conflict',
  422: 'invalid',
}

type Reply = { status: number, body: string } | null
type Send = (
  method: BridgeRequest['method'],
  path: string,
  body?: string | Blob,
  type?: string,
  signal?: AbortSignal,
) => Promise<Reply>

function direct(win: HostWindow, config: BridgeAddress): Send {
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(config.url)) throw new Error(
    'smegglect: bridge url must be http://127.0.0.1:<port>',
  )
  const headers = { authorization: `Bearer ${config.token}` }
  return async (method, path, body, type, signal) => {
    try {
      const res = await win.fetch(`${config.url}${path}`, {
        method,
        headers: type ? { ...headers, 'content-type': type } : headers,
        ...(body ? { body } : {}),
        ...(signal ? { signal } : {}),
        credentials: 'omit',
      })
      return { status: res.status, body: await res.text() }
    }
    catch {
      // A refused or aborted request means no broker answers; null is how the client says offline.
      return null
    }
  }
}

function forwarded(config: BridgeVia): Send {
  if (typeof config.via !== 'function' || !config.label) throw new Error(
    'smegglect: a forwarded bridge needs a label and a via function',
  )
  return async (method, path, body, type, signal) => {
    try {
      const binary = typeof body === 'object'
      const text = binary ? await base64(body) : body
      const reply = await config.via({
        method,
        path,
        ...(text === undefined ? {} : { body: text }),
        ...(type ? { type } : {}),
        ...(binary ? { base64: true } : {}),
      }, signal)
      return reply.status === 0 ? null : reply
    }
    catch {
      // The app's transport failing is the same as no broker running: the client says offline.
      return null
    }
  }
}

const succeeded = (status: number) => status >= 200 && status < 300
const ok = (reply: Reply): reply is { status: number, body: string } => !!reply && succeeded(reply.status)

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && !!value

/**
 * A successful reply's body read as JSON and checked by `shape`; null for a failed request or a body that
 * is not what the broker sends, which the callers treat as no broker answering.
 */
function read<T>(reply: Reply, shape: (value: unknown) => value is T): T | null {
  if (!ok(reply)) return null
  try {
    const value: unknown = JSON.parse(reply.body)
    return shape(value) ? value : null
  }
  catch {
    // Something other than the broker answered on its port: the same as no answer.
    return null
  }
}

const isPage = (value: unknown): value is { seq: number, events: Numbered[] } =>
  isObject(value) && typeof value.seq === 'number' && Array.isArray(value.events)
const isIdList = (value: unknown): value is { id: string }[] =>
  Array.isArray(value) && value.every(entry => isObject(entry) && typeof entry.id === 'string')
const isStatus = (value: unknown): value is BridgeStatus =>
  isObject(value) && isObject(value.agent) && isObject(value.batches)

/** The entries of `value` whose word is one of `words`: the page shows nothing else. */
function knownWords<W extends string>(value: Record<string, unknown>, words: readonly W[]) {
  const known = (word: unknown): word is W => (words as readonly unknown[]).includes(word)
  return Object.fromEntries(Object.entries(value).filter(([, word]) => known(word))) as Record<string, W>
}

/** The per-issue progress, keeping only the words the page knows; none when the broker sends none. */
function issuesOf(value: unknown): BridgeStatus['issues'] {
  if (!isObject(value)) return undefined
  const issues: NonNullable<BridgeStatus['issues']> = {}
  for (const [batchId, batch] of Object.entries(value)) {
    if (isObject(batch)) issues[batchId] = knownWords(batch, ISSUE_PROGRESS)
  }
  return issues
}

/**
 * Uploads the files a stored batch's attachments name; one the page no longer holds is skipped.
 * Null when every upload was stored, else why the first one failed.
 */
async function putAttachments(
  call: Send,
  batch: Batch,
  files: Map<string, Blob>,
): Promise<BridgeResult | null> {
  for (const attachment of batch.attachments) {
    const blob = files.get(attachment.id)
    if (!blob) continue
    const path = `/v1/batches/${batch.id}/attachments/${attachment.id}`
    const res = await call('PUT', path, blob, attachment.mime)
    if (!res) return 'offline'
    if (!succeeded(res.status)) return RESULT[res.status] ?? 'invalid'
  }
  return null
}

/** The page poll's query: which page asks and how it is shown, and the cursor to wait after. */
function pollQuery(after: number | null, poll: PagePoll): URLSearchParams {
  const query = new URLSearchParams({ page: poll.id })
  for (const flag of ['visible', 'focused', 'observer'] as const) if (poll[flag]) query.set(flag, '1')
  if (poll.version) query.set('version', poll.version)
  if (poll.viewport) {
    query.set('w', String(poll.viewport.width))
    query.set('h', String(poll.viewport.height))
  }
  if (after !== null) {
    query.set('after', String(after))
    query.set('wait', String(POLL_S))
  }
  return query
}

export function bridgeClient(win: HostWindow, config: BridgeConfig): BridgeClient {
  const call = 'via' in config ? forwarded(config) : direct(win, config)
  return {
    url: 'via' in config ? null : config.url,
    label: 'via' in config ? config.label : null,
    observer: config.observer === true,
    async health() {
      const body = read(await call('GET', '/v1/health'), isObject)
      return body && { version: String(body.version ?? ''), root: String(body.root ?? '') }
    },
    async listIds() {
      return read(await call('GET', '/v1/batches'), isIdList)?.map(entry => entry.id) ?? null
    },
    async putBatch(batch, files) {
      const res = await call('POST', '/v1/batches', JSON.stringify(batch), 'application/json')
      if (!res) return 'offline'
      const result = RESULT[res.status] ?? 'invalid'
      if (result !== 'stored' && result !== 'duplicate') return result
      return await putAttachments(call, batch, files) ?? result
    },
    status: async () => {
      const status = read(await call('GET', '/v1/status'), isStatus)
      if (!status) return null
      const issues = issuesOf(status.issues)
      const batches = knownWords(status.batches, BATCH_PROGRESS)
      return { agent: status.agent, batches, ...(issues ? { issues } : {}) }
    },
    async batch(id) {
      const res = await call('GET', `/v1/batches/${encodeURIComponent(id)}`)
      return read(res, (value): value is Batch => checkBatch(value).ok)
    },
    async next(after, poll, signal) {
      const query = pollQuery(after, poll)
      return read(await call('GET', `/v1/page/next?${query}`, undefined, undefined, signal), isPage)
    },
    async answer(id, page, value) {
      const res = await call(
        'POST',
        `/v1/checks/${encodeURIComponent(id)}?page=${encodeURIComponent(page)}`,
        JSON.stringify(value),
        'application/json',
      )
      return res?.status === 204
    },
  }
}

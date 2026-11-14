// src/dom/storage.ts
// Draft, submission, follow-up and file storage. IndexedDB by default, memory when it is unavailable.

import type { Attachment, Batch, FollowUp, HistoryEvent, Issue } from '../core/model'
import { checkBatch, checkIssue } from '../core/validate'

export type StoreError = 'unavailable' | 'quota' | 'conflict' | 'corrupt' | 'exists' | 'failed'

export type Res<T> = { ok: true, value: T } | { ok: false, error: StoreError, detail?: string }

export interface DraftRecord {
  key: string
  project: string
  window: string
  batchId: string
  createdAt: string
  /** Incremented by every successful save; a mismatch means another window wrote first. */
  revision: number
  nextSeq: number
  issues: Issue[]
  /** Approved attachments only; pending images never reach storage. */
  attachments: Attachment[]
}

export interface DraftStorage {
  readonly kind: 'indexeddb' | 'memory'
  readonly durable: boolean
  open: () => Promise<Res<void>>
  loadDraft: (key: string) => Promise<Res<DraftRecord | null>>
  saveDraft: (record: DraftRecord, expected: number) => Promise<Res<number>>
  discardDraft: (key: string) => Promise<Res<void>>
  putBatch: (batch: Batch) => Promise<Res<void>>
  listBatches: (project: string) => Promise<Res<Batch[]>>
  deleteBatch: (id: string) => Promise<Res<void>>
  addFollowUp: (f: FollowUp) => Promise<Res<void>>
  listFollowUps: (batchId: string) => Promise<Res<FollowUp[]>>
  putFile: (id: string, project: string, blob: Blob) => Promise<Res<void>>
  getFile: (id: string) => Promise<Res<Blob | null>>
  deleteFile: (id: string) => Promise<Res<void>>
  addEvent: (e: HistoryEvent) => Promise<Res<void>>
  /** Newest first, at most `limit`. */
  listEvents: (project: string, limit: number) => Promise<Res<HistoryEvent[]>>
  close: () => void
}

const ok = <T>(value: T): Res<T> => ({ ok: true, value })
const fail = <T>(error: StoreError, detail?: string): Res<T> => detail ? { ok: false, error, detail } : { ok: false, error }

export function draftKey(project: string, window: string): string {
  return `${project}/${window}`
}

function checkDraft(raw: unknown): raw is DraftRecord {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as DraftRecord
  if (typeof r.key !== 'string' || typeof r.batchId !== 'string' || typeof r.revision !== 'number' || !Array.isArray(r.issues) || !Array.isArray(r.attachments)) return false
  const problems: string[] = []
  r.issues.forEach((issue, i) => checkIssue(issue, `issues[${i}]`, problems))
  return problems.length === 0
}

/** Same contract as IndexedDB, nothing survives a reload. Also the fallback when IndexedDB is unavailable. */
export function memoryStorage(): DraftStorage {
  const drafts = new Map<string, DraftRecord>()
  const batches = new Map<string, Batch>()
  const follow = new Map<string, FollowUp>()
  const files = new Map<string, Blob>()
  const events: HistoryEvent[] = []
  const clone = <T>(v: T): T => structuredClone(v)
  return {
    kind: 'memory',
    durable: false,
    open: async () => ok(undefined),
    loadDraft: async key => ok(drafts.has(key) ? clone(drafts.get(key)!) : null),
    async saveDraft(record, expected) {
      const cur = drafts.get(record.key)?.revision ?? 0
      if (cur !== expected) return fail('conflict')
      const next = { ...clone(record), revision: expected + 1 }
      drafts.set(record.key, next)
      return ok(next.revision)
    },
    discardDraft: async (key) => {
      drafts.delete(key)
      return ok(undefined)
    },
    async putBatch(batch) {
      if (batches.has(batch.id)) return fail('exists')
      batches.set(batch.id, clone(batch))
      return ok(undefined)
    },
    listBatches: async project => ok([...batches.values()].filter(b => b.project.id === project).map(clone)),
    deleteBatch: async (id) => {
      batches.delete(id)
      for (const [k, f] of follow) if (f.batchId === id) follow.delete(k)
      return ok(undefined)
    },
    async addFollowUp(f) {
      const cur = follow.get(f.id)
      if (cur) return JSON.stringify(cur) === JSON.stringify(f) ? ok(undefined) : fail('exists')
      follow.set(f.id, clone(f))
      return ok(undefined)
    },
    listFollowUps: async batchId => ok([...follow.values()].filter(f => f.batchId === batchId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone)),
    putFile: async (id, _project, blob) => {
      files.set(id, blob)
      return ok(undefined)
    },
    getFile: async id => ok(files.get(id) ?? null),
    deleteFile: async (id) => {
      files.delete(id)
      return ok(undefined)
    },
    addEvent: async (e) => {
      events.push(clone(e))
      return ok(undefined)
    },
    listEvents: async (project, limit) => ok(events.filter(e => e.project === project).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(clone)),
    close: () => {},
  }
}

const DB = 'smegglect'
const VERSION = 2

function errorOf(e: unknown): StoreError {
  const name = (e as { name?: string } | null)?.name
  if (name === 'QuotaExceededError') return 'quota'
  if (name === 'SecurityError' || name === 'InvalidStateError') return 'unavailable'
  return 'failed'
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((done, reject) => {
    req.onsuccess = () => done(req.result)
    req.onerror = () => reject(req.error)
  })
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((done, reject) => {
    tx.oncomplete = () => done()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new DOMException('aborted', 'AbortError'))
  })
}

export function indexedDbStorage(idb: IDBFactory): DraftStorage {
  let db: IDBDatabase | null = null

  async function run<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<Res<T>> {
    if (!db) return fail('unavailable')
    try {
      const tx = db.transaction(stores, mode)
      const done = finished(tx)
      const value = await work(tx)
      await done
      return ok(value)
    }
    catch (e) {
      return fail(errorOf(e), (e as Error)?.name)
    }
  }

  return {
    kind: 'indexeddb',
    durable: true,
    async open() {
      try {
        const req = idb.open(DB, VERSION)
        req.onupgradeneeded = () => {
          const d = req.result
          const has = (name: string) => d.objectStoreNames.contains(name)
          if (!has('drafts')) d.createObjectStore('drafts', { keyPath: 'key' })
          if (!has('batches')) d.createObjectStore('batches', { keyPath: 'id' }).createIndex('project', 'project.id')
          if (!has('followups')) d.createObjectStore('followups', { keyPath: 'id' }).createIndex('batchId', 'batchId')
          if (!has('files')) d.createObjectStore('files', { keyPath: 'id' })
          if (!has('events')) d.createObjectStore('events', { keyPath: 'id' }).createIndex('project', 'project')
        }
        db = await request(req)
        // Another tab upgrading the schema must not be blocked by this one.
        db.onversionchange = () => {
          db?.close()
          db = null
        }
        return ok(undefined)
      }
      catch (e) {
        return fail(errorOf(e) === 'failed' ? 'unavailable' : errorOf(e), (e as Error)?.name)
      }
    },
    async loadDraft(key) {
      const res = await run(['drafts'], 'readonly', tx => request(tx.objectStore('drafts').get(key)))
      if (!res.ok) return res
      if (res.value === undefined) return ok(null)
      return checkDraft(res.value) ? ok(res.value) : fail('corrupt')
    },
    saveDraft(record, expected) {
      return run(['drafts'], 'readwrite', async (tx) => {
        const store = tx.objectStore('drafts')
        const cur = await request(store.get(record.key)) as { revision?: unknown } | undefined
        const stored = cur && typeof cur.revision === 'number' ? cur.revision : cur ? -1 : 0
        if (stored !== expected) {
          tx.abort()
          throw Object.assign(new Error('conflict'), { name: 'Conflict' })
        }
        await request(store.put({ ...record, revision: expected + 1 }))
        return expected + 1
      }).then(r => (!r.ok && r.detail === 'Conflict' ? fail<number>('conflict') : r))
    },
    discardDraft: key => run(['drafts'], 'readwrite', async (tx) => {
      await request(tx.objectStore('drafts').delete(key))
    }),
    putBatch(batch) {
      return run(['batches'], 'readwrite', async (tx) => {
        const store = tx.objectStore('batches')
        if (await request(store.getKey(batch.id)) !== undefined) {
          tx.abort()
          throw Object.assign(new Error('exists'), { name: 'Exists' })
        }
        await request(store.add(batch))
      }).then(r => (!r.ok && r.detail === 'Exists' ? fail<void>('exists') : r))
    },
    async listBatches(project) {
      const res = await run(['batches'], 'readonly', tx => request(tx.objectStore('batches').index('project').getAll(project)))
      if (!res.ok) return res
      // A corrupt submitted batch is left in place and skipped, never rewritten.
      return ok((res.value as unknown[]).filter(b => checkBatch(b).ok) as Batch[])
    },
    deleteBatch: id => run(['batches', 'followups'], 'readwrite', async (tx) => {
      await request(tx.objectStore('batches').delete(id))
      const follow = tx.objectStore('followups')
      const keys = await request(follow.index('batchId').getAllKeys(id))
      for (const k of keys) await request(follow.delete(k))
    }),
    addFollowUp(f) {
      return run(['followups'], 'readwrite', async (tx) => {
        const store = tx.objectStore('followups')
        const cur = await request(store.get(f.id))
        if (cur !== undefined) {
          if (JSON.stringify(cur) === JSON.stringify(f)) return
          tx.abort()
          throw Object.assign(new Error('exists'), { name: 'Exists' })
        }
        await request(store.add(f))
      }).then(r => (!r.ok && r.detail === 'Exists' ? fail<void>('exists') : r))
    },
    async listFollowUps(batchId) {
      const res = await run(['followups'], 'readonly', tx => request(tx.objectStore('followups').index('batchId').getAll(batchId)))
      if (!res.ok) return res
      return ok((res.value as FollowUp[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    },
    putFile: (id, project, blob) => run(['files'], 'readwrite', async (tx) => {
      await request(tx.objectStore('files').put({ id, project, blob }))
    }),
    async getFile(id) {
      const res = await run(['files'], 'readonly', tx => request(tx.objectStore('files').get(id)))
      if (!res.ok) return res
      const rec = res.value as { blob?: Blob } | undefined
      return ok(rec?.blob ?? null)
    },
    deleteFile: id => run(['files'], 'readwrite', async (tx) => {
      await request(tx.objectStore('files').delete(id))
    }),
    addEvent: e => run(['events'], 'readwrite', async (tx) => {
      await request(tx.objectStore('events').put(e))
    }),
    async listEvents(project, limit) {
      const res = await run(['events'], 'readonly', tx => request(tx.objectStore('events').index('project').getAll(project)))
      if (!res.ok) return res
      return ok((res.value as HistoryEvent[]).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit))
    },
    close() {
      db?.close()
      db = null
    },
  }
}

/** Small per-project preferences in localStorage; failures only mean they are not remembered. */
export function prefs(win: Window, project: string) {
  const key = `smegglect:prefs:${project}`
  return {
    read<T>(): Partial<T> {
      try {
        const raw = win.localStorage.getItem(key)
        const parsed: unknown = raw ? JSON.parse(raw) : {}
        return parsed && typeof parsed === 'object' ? parsed as Partial<T> : {}
      }
      catch {
        return {}
      }
    },
    write(value: object): boolean {
      try {
        win.localStorage.setItem(key, JSON.stringify(value))
        return true
      }
      catch {
        return false
      }
    },
  }
}

/** Per-tab window identity; it survives a reload of the same tab. */
export function windowId(win: Window, project: string, create: () => string): string {
  const key = `smegglect:window:${project}`
  try {
    const cur = win.sessionStorage.getItem(key)
    if (cur && /^[A-Za-z0-9_-]{1,64}$/.test(cur)) return cur
    const id = create()
    win.sessionStorage.setItem(key, id)
    return id
  }
  catch {
    return create()
  }
}

export function forkWindow(win: Window, project: string, id: string): void {
  try {
    win.sessionStorage.setItem(`smegglect:window:${project}`, id)
  }
  catch {
    // Without sessionStorage the fork lasts until reload, which still avoids the conflict now.
  }
}

// src/dom/storage/indexeddb.ts
// Draft storage in IndexedDB: the schema as a table, one transaction helper, and one set of calls per
// record kind.

import type { Batch, FollowUp, HistoryEvent } from '../../core/model'
import { checkBatch } from '../../core/validate'
import {
  fail, isDraftRecord, newestFirst, ok, sameRecord, type DraftStorage, type Res, type StoreError,
} from './types'

const DB = 'smegglect'
/** Databases already exist at version 2; opening one at a lower version fails, so it stays at 2. */
const VERSION = 2

interface StoreSchema {
  name: string
  keyPath: string
  /** The index the store is listed by. */
  index?: { name: string, path: string }
}

/** Every store, with its key and index. Opening a database that lacks one creates it. */
const STORES: readonly StoreSchema[] = [
  { name: 'drafts', keyPath: 'key' },
  { name: 'batches', keyPath: 'id', index: { name: 'project', path: 'project.id' } },
  { name: 'followups', keyPath: 'id', index: { name: 'batchId', path: 'batchId' } },
  { name: 'files', keyPath: 'id' },
  { name: 'events', keyPath: 'id', index: { name: 'project', path: 'project' } },
]

function upgrade(db: IDBDatabase): void {
  for (const { name, keyPath, index } of STORES) {
    if (db.objectStoreNames.contains(name)) continue
    const store = db.createObjectStore(name, { keyPath })
    if (index) store.createIndex(index.name, index.path)
  }
}

/** The error's name, from a DOMException or anything shaped like one. */
function nameOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('name' in error)) return undefined
  return typeof error.name === 'string' ? error.name : undefined
}

function errorOf(error: unknown): StoreError {
  const name = nameOf(error)
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

/** Ends a transaction on purpose; `run` reports the name, which the call maps back to its own error. */
function abortWith(tx: IDBTransaction, name: 'Conflict' | 'Exists'): never {
  tx.abort()
  throw Object.assign(new Error(name.toLowerCase()), { name })
}

/** A result whose transaction was aborted with `name` becomes `error`; any other result stays. */
function mapAbort<T>(result: Res<T>, name: 'Conflict' | 'Exists', error: StoreError): Res<T> {
  return !result.ok && result.detail === name ? fail<T>(error) : result
}

/** The open database; another tab's schema upgrade closes it. */
interface Connection {
  db: IDBDatabase | null
}

type Run = <T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
) => Promise<Res<T>>

/** One transaction over `stores`: its value once it completes, or why it failed. */
function runner(connection: Connection): Run {
  return async (stores, mode, work) => {
    if (!connection.db) return fail('unavailable')
    try {
      const tx = connection.db.transaction(stores, mode)
      // Both are awaited together: an aborted transaction rejects both, and neither goes unobserved.
      const [value] = await Promise.all([work(tx), finished(tx)])
      return ok(value)
    }
    catch (error) {
      return fail(errorOf(error), nameOf(error))
    }
  }
}

async function openDatabase(idb: IDBFactory, connection: Connection): Promise<Res<void>> {
  try {
    const req = idb.open(DB, VERSION)
    req.onupgradeneeded = () => upgrade(req.result)
    const db = await request(req)
    connection.db = db
    // Another tab upgrading the schema must not be blocked by this one.
    db.onversionchange = () => {
      db.close()
      connection.db = null
    }
    return ok(undefined)
  }
  catch (error) {
    const reason = errorOf(error)
    return fail(reason === 'failed' ? 'unavailable' : reason, nameOf(error))
  }
}

/** The revision a stored draft holds: 0 when there is none, -1 when it has none that reads as a number. */
function storedRevision(stored: { revision?: unknown } | undefined): number {
  if (!stored) return 0
  return typeof stored.revision === 'number' ? stored.revision : -1
}

function draftCalls(run: Run): Pick<DraftStorage, 'loadDraft' | 'saveDraft' | 'discardDraft'> {
  return {
    async loadDraft(key) {
      const res = await run(['drafts'], 'readonly', tx => request(tx.objectStore('drafts').get(key)))
      if (!res.ok) return res
      if (res.value === undefined) return ok(null)
      return isDraftRecord(res.value) ? ok(res.value) : fail('corrupt')
    },
    async saveDraft(record, expected) {
      const saved = await run(['drafts'], 'readwrite', async (tx) => {
        const store = tx.objectStore('drafts')
        const stored = await request(store.get(record.key)) as { revision?: unknown } | undefined
        if (storedRevision(stored) !== expected) abortWith(tx, 'Conflict')
        await request(store.put({ ...record, revision: expected + 1 }))
        return expected + 1
      })
      return mapAbort(saved, 'Conflict', 'conflict')
    },
    discardDraft: key => run(['drafts'], 'readwrite', async (tx) => {
      await request(tx.objectStore('drafts').delete(key))
    }),
  }
}

function batchCalls(run: Run): Pick<DraftStorage, 'putBatch' | 'listBatches' | 'deleteBatch'> {
  return {
    async putBatch(batch) {
      const put = await run(['batches'], 'readwrite', async (tx) => {
        const store = tx.objectStore('batches')
        if (await request(store.getKey(batch.id)) !== undefined) abortWith(tx, 'Exists')
        await request(store.add(batch))
      })
      return mapAbort(put, 'Exists', 'exists')
    },
    async listBatches(project) {
      const res = await run(['batches'], 'readonly', (tx) => {
        return request(tx.objectStore('batches').index('project').getAll(project))
      })
      if (!res.ok) return res
      // A corrupt submitted batch is left in place and skipped, never rewritten.
      return ok((res.value as unknown[]).filter(batch => checkBatch(batch).ok) as Batch[])
    },
    deleteBatch: id => run(['batches', 'followups'], 'readwrite', async (tx) => {
      await request(tx.objectStore('batches').delete(id))
      const followUps = tx.objectStore('followups')
      const keys = await request(followUps.index('batchId').getAllKeys(id))
      for (const key of keys) await request(followUps.delete(key))
    }),
  }
}

function followUpCalls(run: Run): Pick<DraftStorage, 'addFollowUp' | 'listFollowUps'> {
  return {
    async addFollowUp(followUp) {
      const added = await run(['followups'], 'readwrite', async (tx) => {
        const store = tx.objectStore('followups')
        const stored: unknown = await request(store.get(followUp.id))
        if (stored !== undefined && sameRecord(stored, followUp)) return
        if (stored !== undefined) abortWith(tx, 'Exists')
        await request(store.add(followUp))
      })
      return mapAbort(added, 'Exists', 'exists')
    },
    async listFollowUps(batchId) {
      const res = await run(['followups'], 'readonly', (tx) => {
        return request(tx.objectStore('followups').index('batchId').getAll(batchId))
      })
      if (!res.ok) return res
      const followUps = res.value as FollowUp[]
      return ok(followUps.sort((first, second) => first.createdAt.localeCompare(second.createdAt)))
    },
  }
}

function fileCalls(run: Run): Pick<DraftStorage, 'putFile' | 'getFile' | 'deleteFile'> {
  return {
    putFile: (id, blob) => run(['files'], 'readwrite', async (tx) => {
      await request(tx.objectStore('files').put({ id, blob }))
    }),
    async getFile(id) {
      const res = await run(['files'], 'readonly', tx => request(tx.objectStore('files').get(id)))
      if (!res.ok) return res
      const stored = res.value as { blob?: Blob } | undefined
      return ok(stored?.blob ?? null)
    },
    deleteFile: id => run(['files'], 'readwrite', async (tx) => {
      await request(tx.objectStore('files').delete(id))
    }),
  }
}

function eventCalls(run: Run): Pick<DraftStorage, 'addEvent' | 'listEvents' | 'clearEvents'> {
  return {
    addEvent: (event, keep) => run(['events'], 'readwrite', async (tx) => {
      const store = tx.objectStore('events')
      await request(store.put(event))
      const index = store.index('project')
      if (await request(index.count(event.project)) <= keep) return
      const events = await request(index.getAll(event.project)) as HistoryEvent[]
      for (const old of newestFirst(events).slice(keep)) await request(store.delete(old.id))
    }),
    async listEvents(project, limit) {
      const res = await run(['events'], 'readonly', (tx) => {
        return request(tx.objectStore('events').index('project').getAll(project))
      })
      if (!res.ok) return res
      return ok(newestFirst(res.value as HistoryEvent[]).slice(0, limit))
    },
    clearEvents: project => run(['events'], 'readwrite', async (tx) => {
      const store = tx.objectStore('events')
      const keys = await request(store.index('project').getAllKeys(project))
      for (const key of keys) await request(store.delete(key))
    }),
  }
}

export function indexedDbStorage(idb: IDBFactory): DraftStorage {
  const connection: Connection = { db: null }
  const run = runner(connection)
  return {
    kind: 'indexeddb',
    durable: true,
    open: () => openDatabase(idb, connection),
    ...draftCalls(run),
    ...batchCalls(run),
    ...followUpCalls(run),
    ...fileCalls(run),
    ...eventCalls(run),
    close() {
      connection.db?.close()
      connection.db = null
    },
  }
}

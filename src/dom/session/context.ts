// src/dom/session/context.ts
// What the session's parts share, as one object: its options, its store, the image files held in memory,
// the storage in use and where saving stands.

import { createId } from '../../core/ids'
import type { OwnedUrl } from '../scope'
import { draftKey, indexedDbStorage, memoryStorage, tabWindow, type DraftStorage, type StoreError } from '../storage'
import { createStore, type Store } from '../store'
import type { SessionOptions, SessionState, StorageStatus } from './types'

/** Where saving stands; one save runs at a time, and a request meanwhile runs it again after. */
export interface Saving {
  /** The stored record's revision this window last read or wrote. */
  revision: number
  /** The save in progress, settled once nothing asked for meanwhile is left unwritten. */
  running: Promise<void> | null
  /** Asked for while a save ran. */
  dirty: boolean
  /** An unreadable stored record stops saving until it is discarded. */
  blocked: boolean
}

export interface SessionContext {
  readonly options: SessionOptions
  /** The project id. */
  readonly project: string
  readonly store: Store<SessionState>
  /** Image files by attachment id; pending ones live only here. */
  readonly blobs: Map<string, Blob>
  /** One preview URL per attachment, revoked when the attachment goes. */
  readonly urls: Map<string, OwnedUrl>
  /** The chosen storage, or memory once it failed to open. */
  storage: DraftStorage
  readonly saving: Saving
  /** This tab had no window yet: it may take the drafts of the window last used (claim.ts). */
  readonly fresh: boolean
}

export const now = () => new Date().toISOString()

function chosenStorage(options: SessionOptions): DraftStorage {
  if (options.storage === 'memory') return memoryStorage()
  if (options.storage !== 'auto') return options.storage
  return options.win.indexedDB ? indexedDbStorage(options.win.indexedDB) : memoryStorage()
}

export function createContext(options: SessionOptions): SessionContext {
  const project = options.project.id
  const storage = chosenStorage(options)
  const tab = tabWindow(options.win, project)
  const store = createStore<SessionState>({
    status: { kind: 'loading' },
    windowId: tab ?? createId('win'),
    batchId: createId('bat'),
    createdAt: now(),
    attachments: [],
    submitted: [],
    followUps: {},
    shared: {},
    history: [],
  }, options.onError)
  const saving: Saving = { revision: 0, running: null, dirty: false, blocked: false }
  return { options, project, store, blobs: new Map(), urls: new Map(), storage, saving, fresh: tab === null }
}

export function patch(context: SessionContext, change: Partial<SessionState>): void {
  context.store.update(state => ({ ...state, ...change }))
}

/** This window's key for its drafts record. */
export const recordKey = (context: SessionContext) => draftKey(context.project, context.store.get().windowId)

/** Drafts kept in memory, and why: the person chose it, or the browser's storage did not open. */
export function memoryStatus(context: SessionContext): StorageStatus {
  return { kind: 'memory', reason: context.options.storage === 'memory' ? 'chosen' : 'unavailable' }
}

/** A write that worked: saved, unless drafts are kept in memory. */
export function savedStatus(context: SessionContext): StorageStatus {
  return context.storage.durable ? { kind: 'saved', at: now() } : memoryStatus(context)
}

export function failedStatus(error: StoreError): StorageStatus {
  return { kind: 'failed', error: error === 'quota' ? 'quota' : 'failed' }
}

/** A stored image file, else the one still held in memory. */
export async function imageFile(context: SessionContext, id: string): Promise<Blob | null> {
  const stored = await context.storage.getFile(id)
  const file = stored.ok ? stored.value : null
  return file ?? context.blobs.get(id) ?? null
}

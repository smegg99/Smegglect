// src/dom/session/types.ts
// What a session offers the engine and the overlay, and what it is made from.

import type { Drafts } from '../../core/drafts'
import type { Attachment, Batch, FollowUp, HistoryEvent } from '../../core/model'
import type { PresetRegistry } from '../../core/presets'
import type { Scope } from '../scope'
import type { DraftStorage } from '../storage'
import type { Store } from '../store'
import type { HostWindow } from '../window'

export type StorageStatus =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'saved', at: string }
  | { kind: 'memory', reason: 'unavailable' | 'chosen' }
  | { kind: 'failed', error: 'quota' | 'failed' }
  | { kind: 'corrupt' }
  | { kind: 'forked' }

export interface SessionState {
  status: StorageStatus
  windowId: string
  batchId: string
  createdAt: string
  /** Draft attachments; pending ones live only in memory. */
  attachments: Attachment[]
  submitted: Batch[]
  followUps: Record<string, FollowUp[]>
  /** Batches the local bridge holds, as last confirmed by it. */
  shared: Record<string, true>
  /** Activity across sessions, newest first. */
  history: HistoryEvent[]
}

export const HISTORY_LIMIT = 500

export type SubmitResult =
  | { ok: true, batch: Batch }
  | { ok: false, reason: 'empty' | 'invalid' | 'storage', problems?: string[] }

export interface Bundle {
  name: string
  blob: Blob
  markdown: string
  json: string
  /** Approved attachments whose file could not be read; they are named in the Markdown, not included. */
  missing: string[]
}

export { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from '../../core/attachments'

export type AttachResult = 'attached' | 'type' | 'size' | 'frozen'

/** A follow-up as the overlay gives it; the session adds its id when it has none, and the time. */
export type FollowUpInput = Omit<FollowUp, 'id' | 'createdAt'> & { id?: string }

export interface FollowUpResult {
  result: 'added' | 'duplicate' | 'invalid' | 'failed'
  followUp?: FollowUp
}

/** A history line as the engine logs it; the session adds its id, project and time. */
/** A fixed `id` makes a step one line however often, and by however many windows, it is logged. */
export type LogInput = Omit<HistoryEvent, 'id' | 'project' | 'at'> & { id?: string }

export interface SessionOptions {
  win: HostWindow
  project: { id: string, name?: string }
  storage: 'auto' | 'memory' | DraftStorage
  registry: PresetRegistry
  provider?: Record<string, string>
  scope: Scope
  drafts: () => Drafts
  setDrafts: (d: Drafts) => void
  onError: (e: unknown) => void
}

export interface Session {
  store: Store<SessionState>
  ready: Promise<void>
  changed: () => void
  draftBatch: () => Batch
  submit: () => Promise<SubmitResult>
  bundle: (batch: Batch) => Promise<Bundle>
  markdown: (batch: Batch) => string
  deleteBatch: (id: string) => Promise<boolean>
  addFollowUp: (input: FollowUpInput) => Promise<FollowUpResult>
  attach: (issueId: string, file: Blob, name: string) => AttachResult
  approve: (id: string) => Promise<boolean>
  detach: (id: string) => Promise<void>
  preview: (id: string) => string | null
  discardStored: () => Promise<void>
  /** This window's draft issues and the project's history are removed; sent reports stay. */
  clearStored: () => Promise<boolean>
  /** Approved image files of a submitted batch, for the bridge. */
  files: (batch: Batch) => Promise<Map<string, Blob>>
  markShared: (ids: readonly string[]) => void
  /** Appends one history line; failures to store it are not fatal and not shown as saved. */
  log: (e: LogInput) => void
}

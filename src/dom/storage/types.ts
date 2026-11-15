// src/dom/storage/types.ts
// What every draft storage offers, the record a window's drafts are saved as, and the result of each call.

import type { Attachment, Batch, FollowUp, HistoryEvent, Issue } from '../../core/model'
import { checkIssue } from '../../core/validate'

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
  putFile: (id: string, blob: Blob) => Promise<Res<void>>
  getFile: (id: string) => Promise<Res<Blob | null>>
  deleteFile: (id: string) => Promise<Res<void>>
  /** Stores one history line and keeps only the newest `keep` of its project. */
  addEvent: (e: HistoryEvent, keep: number) => Promise<Res<void>>
  /** Newest first, at most `limit`. */
  listEvents: (project: string, limit: number) => Promise<Res<HistoryEvent[]>>
  /** Removes the project's history. */
  clearEvents: (project: string) => Promise<Res<void>>
  close: () => void
}

export const ok = <T>(value: T): Res<T> => ({ ok: true, value })

export function fail<T>(error: StoreError, detail?: string): Res<T> {
  if (detail) return { ok: false, error, detail }
  return { ok: false, error }
}

export function draftKey(project: string, window: string): string {
  return `${project}/${window}`
}

/** History lines newest first, sorted in place. */
export function newestFirst(events: HistoryEvent[]): HistoryEvent[] {
  return events.sort((first, second) => second.at.localeCompare(first.at))
}

/** Two records hold the same values; both are plain data this module wrote, in one key order. */
export function sameRecord(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

/** A stored draft whose fields and issues check out; anything else reads as corrupt. */
export function isDraftRecord(raw: unknown): raw is DraftRecord {
  if (!raw || typeof raw !== 'object') return false
  const record = raw as DraftRecord
  const shaped = typeof record.key === 'string'
    && typeof record.batchId === 'string'
    && typeof record.revision === 'number'
    && Array.isArray(record.issues)
    && Array.isArray(record.attachments)
  if (!shaped) return false
  const problems: string[] = []
  record.issues.forEach((issue, i) => checkIssue(issue, `issues[${i}]`, problems))
  return problems.length === 0
}

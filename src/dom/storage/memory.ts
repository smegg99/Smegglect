// src/dom/storage/memory.ts
// The same contract as IndexedDB, in memory: nothing survives a reload. Also the fallback when IndexedDB
// is unavailable. Values are cloned in and out, as IndexedDB does.

import type { Batch, FollowUp, HistoryEvent } from '../../core/model'
import { fail, newestFirst, ok, sameRecord, type DraftRecord, type DraftStorage } from './types'

const clone = <T>(value: T): T => structuredClone(value)

function memoryDrafts(): Pick<DraftStorage, 'loadDraft' | 'saveDraft' | 'discardDraft'> {
  const drafts = new Map<string, DraftRecord>()
  return {
    async loadDraft(key) {
      const record = drafts.get(key)
      return ok(record ? clone(record) : null)
    },
    async saveDraft(record, expected) {
      const current = drafts.get(record.key)?.revision ?? 0
      if (current !== expected) return fail('conflict')
      const next = { ...clone(record), revision: expected + 1 }
      drafts.set(record.key, next)
      return ok(next.revision)
    },
    async discardDraft(key) {
      drafts.delete(key)
      return ok(undefined)
    },
  }
}

type BatchCalls = 'putBatch' | 'listBatches' | 'deleteBatch' | 'addFollowUp' | 'listFollowUps'

/** Batches and their follow-ups together: deleting a batch deletes its follow-ups. */
function memoryBatches(): Pick<DraftStorage, BatchCalls> {
  const batches = new Map<string, Batch>()
  const followUps = new Map<string, FollowUp>()
  return {
    async putBatch(batch) {
      if (batches.has(batch.id)) return fail('exists')
      batches.set(batch.id, clone(batch))
      return ok(undefined)
    },
    async listBatches(project) {
      return ok([...batches.values()].filter(batch => batch.project.id === project).map(clone))
    },
    async deleteBatch(id) {
      batches.delete(id)
      for (const [key, followUp] of followUps) if (followUp.batchId === id) followUps.delete(key)
      return ok(undefined)
    },
    async addFollowUp(followUp) {
      const stored = followUps.get(followUp.id)
      if (stored) return sameRecord(stored, followUp) ? ok(undefined) : fail('exists')
      followUps.set(followUp.id, clone(followUp))
      return ok(undefined)
    },
    async listFollowUps(batchId) {
      const listed = [...followUps.values()].filter(followUp => followUp.batchId === batchId)
      return ok(listed.sort((first, second) => first.createdAt.localeCompare(second.createdAt)).map(clone))
    },
  }
}

function memoryFiles(): Pick<DraftStorage, 'putFile' | 'getFile' | 'deleteFile'> {
  const files = new Map<string, Blob>()
  return {
    async putFile(id, blob) {
      files.set(id, blob)
      return ok(undefined)
    },
    getFile: async id => ok(files.get(id) ?? null),
    async deleteFile(id) {
      files.delete(id)
      return ok(undefined)
    },
  }
}

function memoryEvents(): Pick<DraftStorage, 'addEvent' | 'listEvents' | 'clearEvents'> {
  const events: HistoryEvent[] = []
  return {
    async addEvent(event, keep) {
      events.push(clone(event))
      const own = events.filter(known => known.project === event.project)
      if (own.length <= keep) return ok(undefined)
      const dropped = new Set(newestFirst(own).slice(keep))
      const kept = events.filter(known => !dropped.has(known))
      events.splice(0, events.length, ...kept)
      return ok(undefined)
    },
    async listEvents(project, limit) {
      const listed = events.filter(event => event.project === project)
      return ok(newestFirst(listed).slice(0, limit).map(clone))
    },
    async clearEvents(project) {
      const kept = events.filter(event => event.project !== project)
      events.splice(0, events.length, ...kept)
      return ok(undefined)
    },
  }
}

export function memoryStorage(): DraftStorage {
  return {
    kind: 'memory',
    durable: false,
    open: async () => ok(undefined),
    ...memoryDrafts(),
    ...memoryBatches(),
    ...memoryFiles(),
    ...memoryEvents(),
    close: () => {},
  }
}

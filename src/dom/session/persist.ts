// src/dom/session/persist.ts
// Loading and saving this window's drafts: the restore at start, one save at a time, and the fork when
// another window wrote the same record.

import { numbered, restoreDrafts } from '../../core/drafts'
import { createId } from '../../core/ids'
import type { Batch, FollowUp } from '../../core/model'
import { scrub } from '../../core/redact'
import { forkWindow, memoryStorage, rememberWindow, type DraftRecord, type Res } from '../storage'
import { claimWindow } from './claim'
import {
  failedStatus, memoryStatus, now, patch, recordKey, savedStatus, type SessionContext,
} from './context'
import { HISTORY_LIMIT, type StorageStatus } from './types'

function draftRecord(context: SessionContext): DraftRecord {
  const { store, project, options, saving } = context
  const state = store.get()
  const drafts = options.drafts()
  return {
    key: recordKey(context),
    project,
    window: state.windowId,
    batchId: state.batchId,
    createdAt: state.createdAt,
    revision: saving.revision,
    issues: scrub(drafts.issues),
    attachments: state.attachments.filter(attachment => attachment.review === 'approved'),
  }
}

/** Another window wrote these drafts. This window keeps its own copy under a new identity. */
function fork(context: SessionContext): void {
  const id = createId('win')
  forkWindow(context.options.win, context.project, id)
  context.saving.revision = 0
  patch(context, { windowId: id, status: { kind: 'forked' } })
  context.saving.dirty = true
}

async function saveOnce(context: SessionContext): Promise<void> {
  const { saving, store } = context
  const result = await context.storage.saveDraft(draftRecord(context), saving.revision)
  if (result.ok) {
    saving.revision = result.value
    rememberWindow(context.options.win, context.project, store.get().windowId)
    // A fork stays visible: saving still works, but in a separate namespace from the other window.
    if (store.get().status.kind !== 'forked') patch(context, { status: savedStatus(context) })
    return
  }
  if (result.error === 'conflict') fork(context)
  else patch(context, { status: failedStatus(result.error) })
}

/** Saves until nothing asked for meanwhile is left; `running` clears in the same step the last pass ends. */
async function drain(context: SessionContext): Promise<void> {
  const { saving } = context
  try {
    do {
      saving.dirty = false
      await saveOnce(context)
    } while (saving.dirty && !saving.blocked)
  }
  finally {
    saving.running = null
  }
}

/** Settles once the drafts as they are now are written: a call during a save shares it, one more pass. */
export function save(context: SessionContext): Promise<void> {
  const { saving } = context
  if (saving.blocked) return Promise.resolve()
  if (saving.running) {
    saving.dirty = true
    return saving.running
  }
  saving.running = drain(context)
  return saving.running
}

/** Puts a stored record back; edits made before storage answered stay on top. True when there were some. */
function restore(context: SessionContext, stored: DraftRecord): boolean {
  const { options, store } = context
  context.saving.revision = stored.revision
  const restored = restoreDrafts(stored.issues)
  const known = new Set(restored.issues.map(issue => issue.id))
  const early = options.drafts().issues.filter(issue => !known.has(issue.id))
  options.setDrafts({ ...restored, issues: numbered([...restored.issues, ...early]) })
  const pending = store.get().attachments.filter(attachment => attachment.review === 'pending')
  const attachments = [...stored.attachments, ...pending]
  patch(context, { batchId: stored.batchId, createdAt: stored.createdAt, attachments })
  return early.length > 0
}

/** Applies what storage held. True when this window has drafts storage does not. */
function applyLoaded(context: SessionContext, loaded: Res<DraftRecord | null>): boolean {
  if (loaded.ok) {
    if (loaded.value) return restore(context, loaded.value)
    return context.options.drafts().issues.length > 0
  }
  if (loaded.error === 'corrupt') {
    // The unreadable record stays where it is until the user discards it.
    context.saving.blocked = true
    patch(context, { status: { kind: 'corrupt' } })
  }
  else patch(context, { status: { kind: 'failed', error: 'failed' } })
  return false
}

/** After the load: saved when a record was restored, idle when there was none, or memory and why. */
function loadedStatus(context: SessionContext, restored: boolean): StorageStatus {
  if (!context.storage.durable) return memoryStatus(context)
  return restored ? { kind: 'saved', at: now() } : { kind: 'idle' }
}

const newestFirst = (first: Batch, second: Batch) => {
  return (second.submittedAt ?? '').localeCompare(first.submittedAt ?? '')
}

async function loadSubmitted(context: SessionContext): Promise<void> {
  const { storage, project, store } = context
  const past = await storage.listEvents(project, HISTORY_LIMIT)
  if (past.ok) patch(context, { history: [...store.get().history, ...past.value].slice(0, HISTORY_LIMIT) })
  const listed = await storage.listBatches(project)
  if (!listed.ok) return
  const submitted = listed.value.sort(newestFirst)
  const followUps: Record<string, FollowUp[]> = {}
  for (const batch of submitted) {
    const found = await storage.listFollowUps(batch.id)
    if (found.ok) followUps[batch.id] = found.value
  }
  patch(context, { submitted, followUps })
}

/** Opens storage, falling back to memory, then restores the drafts, the history and the sent batches. */
export async function init(context: SessionContext): Promise<void> {
  const opened = await context.storage.open()
  if (!opened.ok) {
    context.storage = memoryStorage()
    await context.storage.open()
  }
  await claimWindow(context)
  const loaded = await context.storage.loadDraft(recordKey(context))
  const unsaved = applyLoaded(context, loaded)
  if (context.store.get().status.kind === 'loading') {
    patch(context, { status: loadedStatus(context, loaded.ok && !!loaded.value) })
  }
  await loadSubmitted(context)
  // Only edits made before storage answered are written now; a plain restore writes nothing.
  if (unsaved && !context.saving.blocked) await save(context)
}

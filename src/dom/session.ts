// src/dom/session.ts
// Persistence and submission around the one draft queue: save, restore, freeze, follow up, export.

import { emptyDrafts, restoreDrafts, type Drafts } from '../core/drafts'
import { createId } from '../core/ids'
import { BATCH_SCHEMA, BATCH_VERSION, type Attachment, type Batch, type FollowUp, type HistoryEvent } from '../core/model'
import type { PresetRegistry } from '../core/presets'
import { cleanText, scrub } from '../core/redact'
import { attachmentPath, canonicalJson, renderMarkdown } from '../core/task'
import { allowedState } from '../core/review'
import { checkBatch, isId, LIMITS } from '../core/validate'
import { zip, type ZipEntry } from '../core/zip'
import type { Scope } from './scope'
import { draftKey, forkWindow, indexedDbStorage, memoryStorage, windowId, type DraftRecord, type DraftStorage } from './storage'
import { createStore, type Store } from './store'

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

export type SubmitResult = { ok: true, batch: Batch } | { ok: false, reason: 'empty' | 'invalid' | 'storage', problems?: string[] }

export interface Bundle {
  name: string
  blob: Blob
  markdown: string
  json: string
  /** Approved attachments whose file could not be read; they are named in the Markdown, not included. */
  missing: string[]
}

export const ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024

export type AttachResult = 'attached' | 'type' | 'size' | 'frozen'

export interface SessionOptions {
  win: Window & typeof globalThis
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
  addFollowUp: (input: Omit<FollowUp, 'id' | 'createdAt'> & { id?: string }) => Promise<{ result: 'added' | 'duplicate' | 'invalid' | 'failed', followUp?: FollowUp }>
  attach: (issueId: string, file: Blob, name: string) => AttachResult
  approve: (id: string) => Promise<boolean>
  detach: (id: string) => Promise<void>
  preview: (id: string) => string | null
  discardStored: () => Promise<void>
  /** Stores follow-ups that arrived through the bridge; unknown ids only, each validated. */
  importFollowUps: (batchId: string, list: readonly FollowUp[]) => Promise<number>
  /** Approved image files of a submitted batch, for the bridge. */
  files: (batch: Batch) => Promise<Map<string, Blob>>
  markShared: (ids: readonly string[]) => void
  /** Appends one history line; failures to store it are not fatal and not shown as saved. */
  log: (e: Omit<HistoryEvent, 'id' | 'project' | 'at'>) => void
}

export function createSession(o: SessionOptions): Session {
  const project = o.project.id
  const backend: DraftStorage = o.storage === 'memory'
    ? memoryStorage()
    : o.storage === 'auto'
      ? (o.win.indexedDB ? indexedDbStorage(o.win.indexedDB) : memoryStorage())
      : o.storage
  let storage = backend
  const now = () => new Date().toISOString()
  const store = createStore<SessionState>({
    status: { kind: 'loading' },
    windowId: windowId(o.win, project, () => createId('win')),
    batchId: createId('bat'),
    createdAt: now(),
    attachments: [],
    submitted: [],
    followUps: {},
    shared: {},
    history: [],
  }, o.onError)
  const blobs = new Map<string, Blob>()
  const urls = new Map<string, string>()
  let revision = 0
  let saving = false
  let dirty = false
  let blocked = false

  const patch = (p: Partial<SessionState>) => store.update(s => ({ ...s, ...p }))
  const key = () => draftKey(project, store.get().windowId)

  function record(): DraftRecord {
    const s = store.get()
    const d = o.drafts()
    return {
      key: key(), project, window: s.windowId, batchId: s.batchId, createdAt: s.createdAt, revision,
      nextSeq: d.nextSeq, issues: scrub(d.issues), attachments: s.attachments.filter(a => a.review === 'approved'),
    }
  }

  async function save(): Promise<void> {
    if (blocked) return
    if (saving) {
      dirty = true
      return
    }
    saving = true
    try {
      do {
        dirty = false
        const res = await storage.saveDraft(record(), revision)
        if (res.ok) {
          revision = res.value
          // A fork stays visible: saving still works, but in a separate namespace from the other window.
          if (store.get().status.kind !== 'forked') {
            patch({ status: storage.durable ? { kind: 'saved', at: now() } : { kind: 'memory', reason: o.storage === 'memory' ? 'chosen' : 'unavailable' } })
          }
        }
        else if (res.error === 'conflict') {
          // Another window wrote these drafts. This window keeps its own copy under a new identity.
          const id = createId('win')
          forkWindow(o.win, project, id)
          revision = 0
          patch({ windowId: id, status: { kind: 'forked' } })
          dirty = true
        }
        else {
          patch({ status: { kind: 'failed', error: res.error === 'quota' ? 'quota' : 'failed' } })
        }
      } while (dirty && !blocked)
    }
    finally {
      saving = false
    }
  }

  async function init() {
    let unsaved = false
    const opened = await storage.open()
    if (!opened.ok) {
      storage = memoryStorage()
      await storage.open()
    }
    const loaded = await storage.loadDraft(key())
    if (!loaded.ok) {
      if (loaded.error === 'corrupt') {
        // The unreadable record stays where it is until the user discards it.
        blocked = true
        patch({ status: { kind: 'corrupt' } })
      }
      else patch({ status: { kind: 'failed', error: 'failed' } })
    }
    else if (loaded.value) {
      const r = loaded.value
      revision = r.revision
      const restored = restoreDrafts(r.issues)
      // Edits made before storage answered are kept on top of what was stored.
      const early = o.drafts().issues.filter(i => !restored.issues.some(x => x.id === i.id))
      unsaved = early.length > 0
      o.setDrafts(early.length ? { ...restored, issues: [...restored.issues, ...early], nextSeq: Math.max(restored.nextSeq, r.nextSeq) + early.length } : { ...restored, nextSeq: Math.max(restored.nextSeq, r.nextSeq) })
      patch({ batchId: r.batchId, createdAt: r.createdAt, attachments: [...r.attachments, ...store.get().attachments.filter(a => a.review === 'pending')] })
    }
    else unsaved = o.drafts().issues.length > 0
    if (store.get().status.kind === 'loading') {
      patch({ status: storage.durable ? (loaded.ok && loaded.value ? { kind: 'saved', at: now() } : { kind: 'idle' }) : { kind: 'memory', reason: o.storage === 'memory' ? 'chosen' : 'unavailable' } })
    }
    const past = await storage.listEvents(project, HISTORY_LIMIT)
    if (past.ok) patch({ history: [...store.get().history, ...past.value].slice(0, HISTORY_LIMIT) })
    const listed = await storage.listBatches(project)
    if (listed.ok) {
      const submitted = listed.value.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
      const followUps: Record<string, FollowUp[]> = {}
      for (const b of submitted) {
        const f = await storage.listFollowUps(b.id)
        if (f.ok) followUps[b.id] = f.value
      }
      patch({ submitted, followUps })
    }
    // Only edits made before storage answered are written now; a plain restore writes nothing.
    if (unsaved && !blocked) await save()
  }

  function draftBatch(): Batch {
    const s = store.get()
    const ids = new Set(o.drafts().issues.map(i => i.id))
    // Attachments of a deleted issue stay in memory for undo but never leave with the batch.
    const approved = s.attachments.filter(a => a.review === 'approved' && ids.has(a.issueId))
    const issues = o.drafts().issues.map(i => ({ ...i, attachments: approved.filter(a => a.issueId === i.id).map(a => a.id) }))
    const batch: Batch = {
      schema: BATCH_SCHEMA, version: BATCH_VERSION, id: s.batchId,
      project: o.project.name ? { id: project, name: cleanText(o.project.name, 80) } : { id: project },
      window: { id: s.windowId }, status: 'draft', createdAt: s.createdAt, issues, attachments: approved,
    }
    if (o.provider) batch.provider = Object.fromEntries(Object.entries(o.provider).slice(0, 8).map(([k, v]) => [cleanText(k, 32), cleanText(v, 80)]))
    return scrub(batch)
  }

  function url(id: string, blob: Blob): string {
    const cur = urls.get(id)
    if (cur) return cur
    const u = o.scope.objectUrl(blob)
    urls.set(id, u)
    return u
  }

  const session: Session = {
    store,
    ready: init().catch((e) => {
      o.onError(e)
      patch({ status: { kind: 'failed', error: 'failed' } })
    }),
    changed() {
      void save()
    },
    draftBatch,
    async submit() {
      const draft = draftBatch()
      if (!draft.issues.length) return { ok: false, reason: 'empty' }
      const batch: Batch = { ...draft, status: 'submitted', submittedAt: now(), issues: draft.issues.map(i => ({ ...i, status: 'submitted' })) }
      const checked = checkBatch(batch, o.registry)
      if (!checked.ok) return { ok: false, reason: 'invalid', problems: checked.problems }
      const put = await storage.putBatch(batch)
      if (!put.ok && put.error !== 'exists') return { ok: false, reason: 'storage' }
      const pending = store.get().attachments.filter(a => a.review === 'pending')
      for (const a of pending) blobs.delete(a.id)
      patch({ submitted: [batch, ...store.get().submitted], batchId: createId('bat'), createdAt: now(), attachments: [], followUps: { ...store.get().followUps, [batch.id]: [] } })
      o.setDrafts(emptyDrafts())
      await save()
      session.log({ kind: 'submitted', batchId: batch.id, count: batch.issues.length })
      return { ok: true, batch }
    },
    markdown(batch) {
      return renderMarkdown({ batch, registry: o.registry, followUps: store.get().followUps[batch.id] ?? [], included: new Set(batch.attachments.map(a => a.id)) })
    },
    async bundle(batch) {
      const enc = new TextEncoder()
      const dir = batch.id
      const included = new Set<string>()
      const missing: string[] = []
      const files: ZipEntry[] = []
      for (const a of batch.attachments) {
        if (a.review !== 'approved' || !isId(a.id)) continue
        const res = await storage.getFile(a.id)
        const blob = res.ok ? res.value ?? blobs.get(a.id) ?? null : blobs.get(a.id) ?? null
        if (!blob) {
          missing.push(a.id)
          continue
        }
        included.add(a.id)
        files.push({ name: `${dir}/${attachmentPath(a)}`, data: new Uint8Array(await blob.arrayBuffer()) })
      }
      const followUps = store.get().followUps[batch.id] ?? []
      const markdown = renderMarkdown({ batch, registry: o.registry, followUps, included })
      const json = canonicalJson(batch)
      const entries: ZipEntry[] = [
        { name: `${dir}/batch.json`, data: enc.encode(json) },
        { name: `${dir}/task.md`, data: enc.encode(markdown) },
        ...(followUps.length ? [{ name: `${dir}/followups.json`, data: enc.encode(canonicalJson(followUps)) }] : []),
        ...files,
      ]
      const bytes = zip(entries)
      return { name: `smegglect-${batch.id}.zip`, blob: new Blob([bytes as BlobPart], { type: 'application/zip' }), markdown, json, missing }
    },
    async deleteBatch(id) {
      const batch = store.get().submitted.find(b => b.id === id)
      const res = await storage.deleteBatch(id)
      if (!res.ok) return false
      for (const a of batch?.attachments ?? []) await storage.deleteFile(a.id)
      const { [id]: _gone, ...rest } = store.get().followUps
      patch({ submitted: store.get().submitted.filter(b => b.id !== id), followUps: rest })
      return true
    },
    async addFollowUp(input) {
      const batch = store.get().submitted.find(b => b.id === input.batchId)
      if (!batch || !batch.issues.some(i => i.id === input.issueId)) return { result: 'invalid' }
      const text = input.text.trim().slice(0, LIMITS.note)
      if (!text && input.kind === 'note') return { result: 'invalid' }
      if (!allowedState(input)) return { result: 'invalid' }
      const f: FollowUp = scrub({ ...input, id: input.id ?? createId('fol'), createdAt: now(), text })
      if (!isId(f.id)) return { result: 'invalid' }
      const res = await storage.addFollowUp(f)
      if (!res.ok) return { result: res.error === 'exists' ? 'duplicate' : 'failed' }
      const list = store.get().followUps[f.batchId] ?? []
      if (!list.some(x => x.id === f.id)) patch({ followUps: { ...store.get().followUps, [f.batchId]: [...list, f] } })
      if (f.kind === 'review') session.log({ kind: 'reviewed', batchId: f.batchId, issueId: f.issueId, seq: batch.issues.find(i => i.id === f.issueId)?.seq ?? 0, ...(f.state ? { detail: f.state } : {}) })
      return { result: 'added', followUp: f }
    },
    attach(issueId, file, name) {
      const issue = o.drafts().issues.find(i => i.id === issueId)
      if (!issue || issue.status !== 'draft') return 'frozen'
      if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) return 'type'
      if (file.size > ATTACHMENT_MAX_BYTES) return 'size'
      const a: Attachment = { id: createId('att'), issueId, name: cleanText(name, 80) || 'image', mime: file.type, size: file.size, review: 'pending', createdAt: now() }
      blobs.set(a.id, file)
      patch({ attachments: [...store.get().attachments, a] })
      return 'attached'
    },
    async approve(id) {
      const a = store.get().attachments.find(x => x.id === id)
      const blob = blobs.get(id)
      if (!a || !blob || a.review === 'approved') return false
      const res = await storage.putFile(id, project, blob)
      if (!res.ok) {
        patch({ status: { kind: 'failed', error: res.error === 'quota' ? 'quota' : 'failed' } })
        return false
      }
      patch({ attachments: store.get().attachments.map(x => x.id === id ? { ...x, review: 'approved' as const } : x) })
      void save()
      return true
    },
    async detach(id) {
      const a = store.get().attachments.find(x => x.id === id)
      if (!a) return
      blobs.delete(id)
      if (a.review === 'approved') await storage.deleteFile(id)
      patch({ attachments: store.get().attachments.filter(x => x.id !== id) })
      void save()
    },
    preview(id) {
      const blob = blobs.get(id)
      return blob ? url(id, blob) : null
    },
    async importFollowUps(batchId, list) {
      const known = new Set((store.get().followUps[batchId] ?? []).map(f => f.id))
      const batch = store.get().submitted.find(b => b.id === batchId)
      if (!batch) return 0
      const fresh: FollowUp[] = []
      for (const f of list) {
        if (known.has(f.id) || f.batchId !== batchId || !isId(f.id) || !batch.issues.some(i => i.id === f.issueId) || !allowedState(f)) continue
        if (typeof f.text !== 'string' || f.text.length > LIMITS.note) continue
        const res = await storage.addFollowUp(f)
        if (res.ok || res.error === 'exists') fresh.push(f)
      }
      if (fresh.length) {
        const merged = [...(store.get().followUps[batchId] ?? []), ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        patch({ followUps: { ...store.get().followUps, [batchId]: merged } })
      }
      return fresh.length
    },
    async files(batch) {
      const out = new Map<string, Blob>()
      for (const a of batch.attachments) {
        const res = await storage.getFile(a.id)
        const blob = res.ok ? res.value ?? blobs.get(a.id) : blobs.get(a.id)
        if (blob) out.set(a.id, blob)
      }
      return out
    },
    log(e) {
      const event: HistoryEvent = scrub({ ...e, id: createId('evt'), project, at: now(), ...(e.target ? { target: cleanText(e.target, 120) } : {}) })
      patch({ history: [event, ...store.get().history].slice(0, HISTORY_LIMIT) })
      void storage.addEvent(event)
    },
    markShared(ids) {
      const next = { ...store.get().shared }
      for (const id of ids) next[id] = true
      patch({ shared: next })
    },
    async discardStored() {
      await storage.discardDraft(key())
      blocked = false
      revision = 0
      patch({ status: { kind: 'idle' } })
      await save()
    },
  }
  return session
}

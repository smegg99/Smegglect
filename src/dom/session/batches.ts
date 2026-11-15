// src/dom/session/batches.ts
// Submission and what follows it: the draft batch, freezing it, its task.md and zip, follow-ups, deletion.

import { numbered } from '../../core/drafts'
import { createId } from '../../core/ids'
import { BATCH_SCHEMA, BATCH_VERSION, type Attachment, type Batch, type FollowUp } from '../../core/model'
import { cleanText, scrub } from '../../core/redact'
import { allowedState } from '../../core/review'
import { attachmentPath, canonicalJson, renderMarkdown } from '../../core/task'
import { isId, LIMITS } from '../../core/limits'
import { checkBatch } from '../../core/validate'
import { zip, type ZipEntry } from '../../core/zip'
import { deleteFiles, forget } from './attachments'
import { imageFile, now, patch, type SessionContext } from './context'
import { log } from './history'
import { save } from './persist'
import type { Bundle, FollowUpInput, FollowUpResult, SessionOptions, SubmitResult } from './types'

/** Provider evidence is bounded: eight entries, short keys and values. */
const PROVIDER_ENTRIES = 8

function projectOf(project: SessionOptions['project']): Batch['project'] {
  if (!project.name) return { id: project.id }
  return { id: project.id, name: cleanText(project.name, 80) }
}

export function draftBatch(context: SessionContext): Batch {
  const { options, store } = context
  const state = store.get()
  const drafts = options.drafts().issues
  const ids = new Set(drafts.map(issue => issue.id))
  // Attachments of a deleted issue stay in memory for undo but never leave with the batch.
  const sendable = (attachment: Attachment) => attachment.review === 'approved' && ids.has(attachment.issueId)
  const approved = state.attachments.filter(sendable)
  const issues = drafts.map((issue) => {
    const own = approved.filter(attachment => attachment.issueId === issue.id)
    return { ...issue, attachments: own.map(attachment => attachment.id) }
  })
  const batch: Batch = {
    schema: BATCH_SCHEMA,
    version: BATCH_VERSION,
    id: state.batchId,
    project: projectOf(options.project),
    window: { id: state.windowId },
    status: 'draft',
    createdAt: state.createdAt,
    issues,
    attachments: approved,
  }
  if (options.provider) {
    const entries = Object.entries(options.provider).slice(0, PROVIDER_ENTRIES)
    const cleaned = entries.map(([key, value]) => [cleanText(key, 32), cleanText(value, 80)])
    batch.provider = Object.fromEntries(cleaned)
  }
  return scrub(batch)
}

export async function submit(context: SessionContext): Promise<SubmitResult> {
  const { options } = context
  const draft = draftBatch(context)
  if (!draft.issues.length) return { ok: false, reason: 'empty' }
  const issues = draft.issues.map(issue => ({ ...issue, status: 'submitted' as const }))
  const batch: Batch = { ...draft, status: 'submitted', submittedAt: now(), issues }
  const checked = checkBatch(batch, options.registry)
  if (!checked.ok) return { ok: false, reason: 'invalid', problems: checked.problems }
  const put = await context.storage.putBatch(batch)
  // `exists`: the same batch was already stored, e.g. by a second click while this one waited.
  if (!put.ok && put.error !== 'exists') return { ok: false, reason: 'storage' }
  const gone = settle(context, batch)
  forget(context, gone)
  // The sent images' files stay for the batch; an approved image of an issue deleted before sending goes.
  const sentImages = new Set(batch.attachments.map(attachment => attachment.id))
  await deleteFiles(context, gone.filter(attachment => !sentImages.has(attachment.id)))
  await save(context)
  log(context, { kind: 'submitted', batchId: batch.id, count: batch.issues.length })
  return { ok: true, batch }
}

/**
 * The sent batch joins the submitted ones once, and only its issues leave the drafts: one added while it
 * was stored stays, with its attachments. Returns the attachments that leave with the sent issues.
 */
function settle(context: SessionContext, batch: Batch): Attachment[] {
  const { store, options } = context
  const sent = new Set(batch.issues.map(issue => issue.id))
  const kept = options.drafts().issues.filter(issue => !sent.has(issue.id))
  const keptIds = new Set(kept.map(issue => issue.id))
  const attachments = store.get().attachments
  const others = store.get().submitted.filter(known => known.id !== batch.id)
  patch(context, {
    submitted: [batch, ...others],
    batchId: createId('bat'),
    createdAt: now(),
    attachments: attachments.filter(attachment => keptIds.has(attachment.issueId)),
    followUps: { ...store.get().followUps, [batch.id]: store.get().followUps[batch.id] ?? [] },
  })
  options.setDrafts({ issues: numbered(kept), undo: [], redo: [] })
  return attachments.filter(attachment => !keptIds.has(attachment.issueId))
}

export function markdown(context: SessionContext, batch: Batch): string {
  return renderMarkdown({
    batch,
    registry: context.options.registry,
    followUps: context.store.get().followUps[batch.id] ?? [],
    included: new Set(batch.attachments.map(attachment => attachment.id)),
  })
}

/** The zip a person exports: batch.json, task.md, follow-ups when there are any, and the approved images. */
export async function bundle(context: SessionContext, batch: Batch): Promise<Bundle> {
  const encoder = new TextEncoder()
  const folder = batch.id
  const included = new Set<string>()
  const missing: string[] = []
  const images: ZipEntry[] = []
  for (const attachment of batch.attachments) {
    if (attachment.review !== 'approved' || !isId(attachment.id)) continue
    const blob = await imageFile(context, attachment.id)
    if (!blob) {
      missing.push(attachment.id)
      continue
    }
    included.add(attachment.id)
    const data = new Uint8Array(await blob.arrayBuffer())
    images.push({ name: `${folder}/${attachmentPath(attachment)}`, data })
  }
  const followUps = context.store.get().followUps[batch.id] ?? []
  const markdown = renderMarkdown({ batch, registry: context.options.registry, followUps, included })
  const json = canonicalJson(batch)
  const entries: ZipEntry[] = [
    { name: `${folder}/batch.json`, data: encoder.encode(json) },
    { name: `${folder}/task.md`, data: encoder.encode(markdown) },
  ]
  if (followUps.length) {
    entries.push({ name: `${folder}/followups.json`, data: encoder.encode(canonicalJson(followUps)) })
  }
  const blob = new Blob([zip([...entries, ...images]) as BlobPart], { type: 'application/zip' })
  return { name: `smegglect-${batch.id}.zip`, blob, markdown, json, missing }
}

export async function deleteBatch(context: SessionContext, id: string): Promise<boolean> {
  const { store, storage } = context
  const batch = store.get().submitted.find(candidate => candidate.id === id)
  const res = await storage.deleteBatch(id)
  if (!res.ok) return false
  for (const attachment of batch?.attachments ?? []) await storage.deleteFile(attachment.id)
  const { [id]: _gone, ...rest } = store.get().followUps
  const submitted = store.get().submitted.filter(candidate => candidate.id !== id)
  patch(context, { submitted, followUps: rest })
  return true
}

/** A follow-up on a sent issue, stored once; the same id again is a duplicate. */
export async function addFollowUp(context: SessionContext, input: FollowUpInput): Promise<FollowUpResult> {
  const { store } = context
  const batch = store.get().submitted.find(candidate => candidate.id === input.batchId)
  if (!batch || !batch.issues.some(issue => issue.id === input.issueId)) return { result: 'invalid' }
  const text = input.text.trim().slice(0, LIMITS.note)
  if (!text && input.kind === 'note') return { result: 'invalid' }
  if (!allowedState(input)) return { result: 'invalid' }
  const followUp: FollowUp = scrub({ ...input, id: input.id ?? createId('fol'), createdAt: now(), text })
  if (!isId(followUp.id)) return { result: 'invalid' }
  const res = await context.storage.addFollowUp(followUp)
  if (!res.ok) return { result: res.error === 'exists' ? 'duplicate' : 'failed' }
  const list = store.get().followUps[followUp.batchId] ?? []
  if (!list.some(known => known.id === followUp.id)) {
    patch(context, { followUps: { ...store.get().followUps, [followUp.batchId]: [...list, followUp] } })
  }
  return { result: 'added', followUp }
}

/** Approved image files of a submitted batch, for the bridge. */
export async function files(context: SessionContext, batch: Batch): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>()
  for (const attachment of batch.attachments) {
    const blob = await imageFile(context, attachment.id)
    if (blob) out.set(attachment.id, blob)
  }
  return out
}

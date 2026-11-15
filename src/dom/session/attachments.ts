// src/dom/session/attachments.ts
// Images a person attaches to a draft issue: held in memory until approved, then stored with the drafts.

import { createId } from '../../core/ids'
import type { Attachment } from '../../core/model'
import { cleanText } from '../../core/redact'
import { failedStatus, now, patch, type SessionContext } from './context'
import { save } from './persist'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, type AttachResult } from './types'

const isImageType = (type: string) => (ATTACHMENT_TYPES as readonly string[]).includes(type)

export function attach(context: SessionContext, issueId: string, file: Blob, name: string): AttachResult {
  const issue = context.options.drafts().issues.find(candidate => candidate.id === issueId)
  if (!issue || issue.status !== 'draft') return 'frozen'
  if (!isImageType(file.type)) return 'type'
  if (file.size > ATTACHMENT_MAX_BYTES) return 'size'
  const attachment: Attachment = {
    id: createId('att'),
    issueId,
    name: cleanText(name, 80) || 'image',
    mime: file.type,
    size: file.size,
    review: 'pending',
    createdAt: now(),
  }
  context.blobs.set(attachment.id, file)
  patch(context, { attachments: [...context.store.get().attachments, attachment] })
  return 'attached'
}

export async function approve(context: SessionContext, id: string): Promise<boolean> {
  const { store, blobs } = context
  const attachment = store.get().attachments.find(candidate => candidate.id === id)
  const blob = blobs.get(id)
  if (!attachment || !blob || attachment.review === 'approved') return false
  const res = await context.storage.putFile(id, blob)
  if (!res.ok) {
    patch(context, { status: failedStatus(res.error) })
    return false
  }
  const approved = (candidate: Attachment): Attachment => {
    return candidate.id === id ? { ...candidate, review: 'approved' } : candidate
  }
  patch(context, { attachments: store.get().attachments.map(approved) })
  void save(context)
  return true
}

/** Lets go of the images held in memory for these attachments, and of their preview URLs. */
export function forget(context: SessionContext, gone: readonly Attachment[]): void {
  for (const { id } of gone) {
    context.blobs.delete(id)
    context.urls.get(id)?.revoke()
    context.urls.delete(id)
  }
}

/** Deletes the stored files of approved attachments that no draft or batch holds any more. */
export async function deleteFiles(context: SessionContext, gone: readonly Attachment[]): Promise<void> {
  for (const attachment of gone) {
    if (attachment.review === 'approved') await context.storage.deleteFile(attachment.id)
  }
}

export async function detach(context: SessionContext, id: string): Promise<void> {
  const { store } = context
  const attachment = store.get().attachments.find(candidate => candidate.id === id)
  if (!attachment) return
  forget(context, [attachment])
  await deleteFiles(context, [attachment])
  patch(context, { attachments: store.get().attachments.filter(candidate => candidate.id !== id) })
  void save(context)
}

/** One object URL per attachment, revoked when the attachment goes or with the session's scope. */
export function preview(context: SessionContext, id: string): string | null {
  const blob = context.blobs.get(id)
  if (!blob) return null
  const known = context.urls.get(id)
  if (known) return known.url
  const owned = context.options.scope.objectUrl(blob)
  context.urls.set(id, owned)
  return owned.url
}

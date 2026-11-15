// src/dom/session/history.ts
// The activity history, and clearing what this window and project keep.

import { emptyDrafts } from '../../core/drafts'
import { createId } from '../../core/ids'
import type { HistoryEvent } from '../../core/model'
import { cleanText, scrub } from '../../core/redact'
import { deleteFiles, forget } from './attachments'
import { now, patch, recordKey, type SessionContext } from './context'
import { save } from './persist'
import { HISTORY_LIMIT, type LogInput } from './types'

export function log(context: SessionContext, input: LogInput): void {
  const { store, project } = context
  const event: HistoryEvent = { ...input, id: input.id ?? createId('evt'), project, at: now() }
  if (input.target) event.target = cleanText(input.target, 120)
  const scrubbed = scrub(event)
  const others = store.get().history.filter(old => old.id !== scrubbed.id)
  patch(context, { history: [scrubbed, ...others].slice(0, HISTORY_LIMIT) })
  void context.storage.addEvent(scrubbed, HISTORY_LIMIT)
}

/** Other windows' draft records are left alone: claim.ts may still hand them to a window. */
export async function clearStored(context: SessionContext): Promise<boolean> {
  context.options.setDrafts(emptyDrafts())
  // With the drafts gone their images belong to nothing; sent ones left the drafts at submission.
  const gone = context.store.get().attachments
  patch(context, { attachments: [] })
  forget(context, gone)
  await deleteFiles(context, gone)
  const cleared = await context.storage.clearEvents(context.project)
  patch(context, { history: [] })
  await save(context)
  return cleared.ok
}

/** Drops an unreadable stored record, which unblocks saving. */
export async function discardStored(context: SessionContext): Promise<void> {
  await context.storage.discardDraft(recordKey(context))
  context.saving.blocked = false
  context.saving.revision = 0
  patch(context, { status: { kind: 'idle' } })
  await save(context)
}

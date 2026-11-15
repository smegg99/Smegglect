// src/overlay/exporting.ts
// Copy and export actions with honest fallbacks: the text is always reachable when a channel fails.

import type { Batch } from '../core/model'
import type { MessageAction, Runtime } from './runtime'

let seq = 0

export function say(rt: Runtime, text: string, warn = false, action?: MessageAction) {
  rt.ui.message = { id: ++seq, text, warn, ...(action ? { action } : {}) }
}

/** The batch to send: a submitted one as-is, or the current drafts frozen now. */
async function batchFor(rt: Runtime, batchId: string | null): Promise<Batch | null> {
  const { engine, t } = rt
  if (batchId) return engine.session.store.get().submitted.find(b => b.id === batchId) ?? null
  const res = await engine.session.submit()
  if (res.ok) return res.batch
  if (res.reason !== 'empty') say(
    rt,
    res.reason === 'invalid' ? t('export.invalid') : t('export.storageFailed'),
    true,
  )
  return null
}

export async function copyPrompt(rt: Runtime, batchId: string | null = null): Promise<void> {
  const batch = await batchFor(rt, batchId)
  if (!batch) return
  const text = rt.engine.session.markdown(batch)
  try {
    // The clipboard answers only the focused document: the pop-out's while the person works there.
    const clipboard = rt.active().defaultView?.navigator.clipboard
    if (!clipboard) throw new Error('smegglect: no clipboard in this window')
    await clipboard.writeText(text)
    say(rt, rt.t('export.copied'))
    rt.engine.session.log({ kind: 'copied', batchId: batch.id })
  }
  catch {
    say(rt, rt.t('export.copyFailed'), true)
  }
}

function download(rt: Runtime, blob: Blob, name: string): boolean {
  const doc = rt.doc
  const url = rt.engine.objectUrl(blob, 30_000)
  try {
    const a = doc.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    // Clicked detached: nothing is added to the host document.
    a.click()
    return true
  }
  catch {
    return false
  }
}

export async function exportBatch(rt: Runtime, batchId: string | null = null): Promise<void> {
  const batch = await batchFor(rt, batchId)
  if (!batch) return
  const bundle = await rt.engine.session.bundle(batch)
  let saved: boolean
  try {
    saved = rt.save
      ? await rt.save({ name: bundle.name, blob: bundle.blob })
      : download(rt, bundle.blob, bundle.name)
  }
  catch {
    saved = false
  }
  if (!saved) {
    say(rt, rt.t('export.exportFailed'), true)
    return
  }
  rt.engine.session.log({ kind: 'exported', batchId: batch.id })
  say(
    rt,
    bundle.missing.length
      ? `${rt.t('export.exported', { name: bundle.name })} ${rt.t('export.missing')}`
      : rt.t('export.exported', { name: bundle.name }),
    bundle.missing.length > 0,
  )
}

/** Submits (when needed) and hands the batch to the local bridge. Says exactly what happened. */
export async function shareBatch(rt: Runtime, batchId: string | null = null): Promise<void> {
  const bridge = rt.engine.bridge
  if (!bridge) return
  const batch = await batchFor(rt, batchId)
  if (!batch) return
  const result = await bridge.putBatch(batch, await rt.engine.session.files(batch))
  if (result === 'stored' || result === 'duplicate') {
    rt.engine.session.markShared([batch.id])
    rt.engine.session.log({ kind: 'shared', batchId: batch.id })
    rt.ui.bridge = 'connected'
    say(rt, rt.t('bridge.shared', { id: batch.id }))
    return
  }
  if (result === 'offline') rt.ui.bridge = 'offline'
  say(rt, rt.t('bridge.failed'), true)
}

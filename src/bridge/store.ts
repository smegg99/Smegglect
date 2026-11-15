// src/bridge/store.ts
// The one writer of a project's .smegglect/ directory: each file written once and whole, ids as path parts.

import { lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { ATTACHMENT_MAX_BYTES, attachmentExtension } from '../core/attachments'
import type { Attachment, Batch, FollowUp, Issue } from '../core/model'
import type { PresetRegistry } from '../core/presets'
import { issueState, parseFollowUp, type IssueState } from '../core/review'
import { scrub } from '../core/redact'
import { canonicalJson } from '../core/task'
import { isId } from '../core/limits'
import { checkBatch } from '../core/validate'
import { readRecord, storePath, sweepTemporary, writeOnce } from './store-files'

export type Put = 'stored' | 'duplicate' | 'conflict' | 'invalid' | 'missing'

export interface BatchSummary {
  id: string
  project: string
  submittedAt?: string
  issues: { id: string, seq: number, preset: string, state: IssueState }[]
}

/** A follow-up as an agent reads it, under its issue: without the ids it is filed under. */
export type IssueFollowUp = Omit<FollowUp, 'batchId' | 'issueId'>

/** An approved image the page uploaded, as the agent reads it: where the file is, never its name. */
export interface StoredImage {
  id: string
  mime: string
  size: number
  /** `.smegglect/batches/<batch>/attachments/<id>.<ext>`, relative to the bridge root. */
  path: string
}

/** One issue with its follow-ups, where it stands, and only the context of the batch it came in. */
export interface IssueRecord {
  issue: Issue
  followUps: IssueFollowUp[]
  state: IssueState
  images: StoredImage[]
  batch: { id: string, project: Batch['project'], provider?: Batch['provider'], submittedAt?: string }
}

export interface StoredFile {
  mime: string
  bytes: Buffer
}

export interface Store {
  /** `<project>/.smegglect`, symlinks resolved. */
  root: string
  putBatch: (input: unknown) => Promise<Put>
  getBatch: (id: string) => Promise<Batch | null>
  followUps: (batchId: string) => Promise<FollowUp[]>
  listBatches: () => Promise<BatchSummary[]>
  issue: (batchId: string, issueId: string) => Promise<IssueRecord | null>
  /** Appends; the same id with the same content, at any time, is a no-op, with other content a conflict. */
  addFollowUp: (input: FollowUp) => Promise<Put>
  putAttachment: (batchId: string, attachmentId: string, mime: string, bytes: Uint8Array) => Promise<Put>
  /** An approved image's bytes; a pending one is never stored. */
  attachment: (batchId: string, attachmentId: string) => Promise<StoredFile | null>
  /** Each issue's approved images that the page uploaded, by issue id. */
  images: (batchId: string) => Promise<Map<string, StoredImage[]>>
}

/** Writes a record once: the same content again is a duplicate, other content under its id a conflict. */
async function putOnce(file: string, json: string, same: (stored: unknown) => boolean): Promise<Put> {
  if (await writeOnce(file, json)) return 'stored'
  return same(await readRecord(file)) ? 'duplicate' : 'conflict'
}

/** A batch the store holds, read again as any batch from outside is: one that does not check is absent. */
async function getBatch(root: string, id: string): Promise<Batch | null> {
  if (!isId(id)) return null
  const checked = checkBatch(await readRecord(await storePath(root, id, 'batch.json')))
  return checked.ok && checked.value.id === id ? checked.value : null
}

/** The batch's follow-ups, oldest first; a record that does not parse, or is filed elsewhere, is skipped. */
async function followUps(root: string, batchId: string): Promise<FollowUp[]> {
  if (!isId(batchId)) return []
  const dir = await storePath(root, batchId, 'followups')
  const names = await readdir(dir).catch(() => [] as string[])
  const out: FollowUp[] = []
  for (const name of names.filter(name => name.endsWith('.json'))) {
    const followUp = parseFollowUp(await readRecord(await storePath(root, batchId, 'followups', name)))
    if (followUp?.batchId === batchId && name === `${followUp.id}.json`) out.push(followUp)
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

/** Checked as it will be stored: masking a secret may lengthen a text past its bound. */
async function putBatch(root: string, registry: PresetRegistry, input: unknown): Promise<Put> {
  const checked = checkBatch(scrub(input), registry)
  if (!checked.ok || checked.value.status !== 'submitted') return 'invalid'
  const batch = checked.value
  await mkdir(await storePath(root, batch.id, 'followups'), { recursive: true, mode: 0o700 })
  const json = canonicalJson(batch)
  const file = await storePath(root, batch.id, 'batch.json')
  return putOnce(file, json, stored => canonicalJson(stored) === json)
}

function summaryOf(batch: Batch, records: readonly FollowUp[]): BatchSummary {
  return {
    id: batch.id,
    project: batch.project.id,
    submittedAt: batch.submittedAt,
    issues: batch.issues.map(issue => ({
      id: issue.id,
      seq: issue.seq,
      preset: issue.intent.preset.id,
      state: issueState(records, issue.id),
    })),
  }
}

/** Newest first. */
async function listBatches(root: string): Promise<BatchSummary[]> {
  const ids = (await readdir(join(root, 'batches')).catch(() => [] as string[])).filter(isId)
  const out: BatchSummary[] = []
  for (const id of ids) {
    // A symlinked or unreadable entry is skipped, never followed and never fatal for the listing.
    const batch = await getBatch(root, id).catch(() => null)
    if (batch) out.push(summaryOf(batch, await followUps(root, id)))
  }
  return out.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
}

async function issueRecord(root: string, batchId: string, issueId: string): Promise<IssueRecord | null> {
  const batch = await getBatch(root, batchId)
  const issue = batch?.issues.find(candidate => candidate.id === issueId)
  if (!batch || !issue) return null
  const records = (await followUps(root, batchId)).filter(record => record.issueId === issueId)
  const { id, project, provider, submittedAt } = batch
  const context = { id, project, provider, submittedAt }
  const filed = records.map(({ batchId: _batch, issueId: _issue, ...rest }) => rest)
  const images = (await storedImages(root, batch)).get(issueId) ?? []
  return { issue, followUps: filed, state: issueState(records, issueId), images, batch: context }
}

/** What a follow-up says, without when: a retry is stamped anew, and the first record stays. */
function content(record: unknown): string | null {
  const followUp = parseFollowUp(record)
  return followUp && canonicalJson({ ...followUp, createdAt: undefined })
}

async function addFollowUp(root: string, input: FollowUp): Promise<Put> {
  const followUp = parseFollowUp(scrub(input))
  if (!followUp) return 'invalid'
  const batch = await getBatch(root, followUp.batchId)
  if (!batch?.issues.some(issue => issue.id === followUp.issueId)) return 'missing'
  const file = await storePath(root, followUp.batchId, 'followups', `${followUp.id}.json`)
  const said = content(followUp)
  return putOnce(file, canonicalJson(followUp), stored => content(stored) === said)
}

async function putAttachment(
  root: string,
  batchId: string,
  attachmentId: string,
  mime: string,
  bytes: Uint8Array,
): Promise<Put> {
  const batch = await getBatch(root, batchId)
  const attachment = batch?.attachments.find(candidate => candidate.id === attachmentId)
  if (!batch || !attachment) return 'missing'
  const extension = attachmentExtension(mime)
  const fits = attachment.review === 'approved'
    && attachment.mime === mime
    && bytes.length <= ATTACHMENT_MAX_BYTES
    && bytes.length === attachment.size
  if (!fits || extension === undefined) return 'invalid'
  await mkdir(await storePath(root, batchId, 'attachments'), { recursive: true, mode: 0o700 })
  const file = await storePath(root, batchId, 'attachments', `${attachmentId}.${extension}`)
  // The page sends an image's bytes once; the same id again is that image again.
  return await writeOnce(file, bytes) ? 'stored' : 'duplicate'
}

/** The file of an approved attachment the page uploaded, or null. */
async function attachmentFile(root: string, batchId: string, attachment: Attachment): Promise<string | null> {
  const extension = attachmentExtension(attachment.mime)
  if (attachment.review !== 'approved' || extension === undefined) return null
  const name = `${attachment.id}.${extension}`
  const file = await storePath(root, batchId, 'attachments', name)
  const stat = await lstat(file).catch(() => null)
  return stat?.isFile() ? name : null
}

async function storedAttachment(
  root: string,
  batchId: string,
  attachmentId: string,
): Promise<StoredFile | null> {
  const batch = await getBatch(root, batchId)
  const attachment = batch?.attachments.find(candidate => candidate.id === attachmentId)
  const name = attachment ? await attachmentFile(root, batchId, attachment) : null
  if (!attachment || !name) return null
  return { mime: attachment.mime, bytes: await readFile(await storePath(root, batchId, 'attachments', name)) }
}

async function storedImages(root: string, batch: Batch): Promise<Map<string, StoredImage[]>> {
  const byIssue = new Map<string, StoredImage[]>()
  for (const attachment of batch.attachments) {
    const name = await attachmentFile(root, batch.id, attachment)
    if (!name) continue
    const { id, mime, size } = attachment
    const path = ['.smegglect', 'batches', batch.id, 'attachments', name].join('/')
    byIssue.set(attachment.issueId, [...byIssue.get(attachment.issueId) ?? [], { id, mime, size, path }])
  }
  return byIssue
}

/** Opening the store sweeps what a broker that stopped mid-write left. */
export async function openStore(projectRoot: string, registry: PresetRegistry): Promise<Store> {
  const base = join(await realpath(projectRoot), '.smegglect')
  await mkdir(join(base, 'batches'), { recursive: true, mode: 0o700 })
  const root = await realpath(base)
  await sweepTemporary(root)
  return {
    root,
    putBatch: input => putBatch(root, registry, input),
    getBatch: id => getBatch(root, id),
    followUps: batchId => followUps(root, batchId),
    listBatches: () => listBatches(root),
    issue: (batchId, issueId) => issueRecord(root, batchId, issueId),
    addFollowUp: input => addFollowUp(root, input),
    putAttachment: (batchId, attachmentId, mime, bytes) => {
      return putAttachment(root, batchId, attachmentId, mime, bytes)
    },
    attachment: (batchId, attachmentId) => storedAttachment(root, batchId, attachmentId),
    images: async (batchId) => {
      const batch = await getBatch(root, batchId)
      return batch ? storedImages(root, batch) : new Map()
    },
  }
}

// src/core/validate.ts
// Structural validation for batches read from storage, files or a bridge. One validator per shape; each
// adds its problems to the list it is given (a new one when none is) and returns that list.

import { ATTACHMENT_MAX_BYTES, attachmentExtension } from './attachments'
import { BATCH_SCHEMA, BATCH_VERSION, CONSTRAINTS, type Batch } from './model'
import { findPreset, type PresetRegistry } from './presets'
import { LIMITS, isId } from './limits'
import { hasNumbers, isBoundedList, isNum, isObj, isStr, isStringMap, oneOf, stop, type Obj } from './shape'

const SCOPES: ReadonlySet<string> = new Set(['occurrence', 'screen', 'component'])
const KINDS: ReadonlySet<string> = new Set(['dom', 'group', 'region'])
const BOUNDARIES: ReadonlySet<string> = new Set(['canvas', 'iframe', 'closed-root', 'native', 'manual'])
const QUALITIES: ReadonlySet<string> = new Set(['exact', 'component', 'visual-only'])
const STATUSES: ReadonlySet<string> = new Set(['draft', 'submitted'])
const FRAMES: ReadonlySet<string> = new Set(['viewport', 'document'])
const REVIEWS: ReadonlySet<string> = new Set(['pending', 'approved'])
const SCHEMES: ReadonlySet<string> = new Set(['light', 'dark', 'unknown'])
const AXES: ReadonlySet<string> = new Set(['gap', 'touch', 'overlap'])
const PROVIDER_STATUSES: ReadonlySet<string> = new Set(['failed', 'timeout'])
const CONTENTS_MODES: ReadonlySet<string> = new Set(['inside', 'touching'])
const RECT_KEYS = ['x', 'y', 'width', 'height'] as const
const DELTA_KEYS = ['left', 'right', 'top', 'bottom', 'centerX', 'centerY', 'width', 'height'] as const
const OPTIONAL_NAMES = ['role', 'id', 'testId'] as const

export type Problems = string[]

export type Checked<T> = { ok: true, value: T } | { ok: false, problems: Problems }

const isConstraint = (value: unknown) => (CONSTRAINTS as readonly unknown[]).includes(value)

export function checkRect(value: unknown, at: string, out: Problems = []): Problems {
  if (!isObj(value)) return stop(out, `${at}: rect expected`)
  for (const key of RECT_KEYS) if (!isNum(value[key])) out.push(`${at}.${key}: finite number expected`)
  if (isNum(value.width) && value.width < 0) out.push(`${at}.width: negative`)
  if (isNum(value.height) && value.height < 0) out.push(`${at}.height: negative`)
  return out
}

function checkOccurrence(value: unknown, at: string, out: Problems): void {
  const placed = isObj(value) && isNum(value.index) && isNum(value.count)
    && value.index >= 0 && value.index < value.count
  if (!placed) out.push(`${at}: invalid`)
  else if (value.item !== undefined && !isStr(value.item, LIMITS.label)) out.push(`${at}.item: too long`)
}

export function checkElement(value: unknown, at: string, out: Problems = []): Problems {
  if (!isObj(value)) return stop(out, `${at}: element descriptor expected`)
  if (!isStr(value.tag, LIMITS.name) || !value.tag) out.push(`${at}.tag: missing`)
  for (const key of OPTIONAL_NAMES) {
    if (value[key] !== undefined && !isStr(value[key])) out.push(`${at}.${key}: bounded string expected`)
  }
  if (value.label !== undefined && !isStr(value.label, LIMITS.label)) out.push(`${at}.label: too long`)
  const classes = isBoundedList(value.classes, LIMITS.classes, LIMITS.name)
  if (!classes) out.push(`${at}.classes: bounded list expected`)
  const path = isBoundedList(value.path, LIMITS.path, LIMITS.pathStep)
  if (!path) out.push(`${at}.path: bounded list expected`)
  if (!isNum(value.shadowDepth) || value.shadowDepth < 0) out.push(`${at}.shadowDepth: expected`)
  if (value.occurrence !== undefined) checkOccurrence(value.occurrence, `${at}.occurrence`, out)
  return out
}

function checkGroup(value: Obj, at: string, out: Problems): void {
  const { members, anchor } = value
  if (!Array.isArray(members) || members.length < 2) out.push(`${at}.members: two or more expected`)
  else members.forEach((member, i) => checkElement(member, `${at}.members[${i}]`, out))
  const inRange = isNum(anchor) && Array.isArray(members) && anchor >= 0 && anchor < members.length
  if (anchor !== undefined && !inRange) out.push(`${at}.anchor: out of range`)
}

function checkRegion(value: Obj, at: string, out: Problems): void {
  checkRect(value.rect, `${at}.rect`, out)
  if (!oneOf(FRAMES, value.frame)) out.push(`${at}.frame: invalid`)
  if (!oneOf(BOUNDARIES, value.boundary)) out.push(`${at}.boundary: invalid`)
}

/** A target: one element, a group of two or more, or a region. */
export function checkTarget(value: unknown, at: string, out: Problems = []): Problems {
  if (!isObj(value) || !oneOf(KINDS, value.kind)) return stop(out, `${at}: target kind expected`)
  if (value.kind === 'dom') checkElement(value.element, `${at}.element`, out)
  if (value.kind === 'group') checkGroup(value, at, out)
  if (value.kind === 'region') checkRegion(value, at, out)
  return out
}

/** A source location claims no more than its quality allows: exact needs a file and line, visual none. */
export function checkSource(value: unknown, at: string, out: Problems = []): Problems {
  if (!isObj(value) || !oneOf(QUALITIES, value.quality)) return stop(out, `${at}.quality: invalid`)
  const { quality, provenance, file, line, column, owners } = value
  if (!isStr(provenance, LIMITS.name) || !provenance) out.push(`${at}.provenance: missing`)
  const ownersFit = owners === undefined || isBoundedList(owners, LIMITS.path, LIMITS.component)
  if (!ownersFit) out.push(`${at}.owners: bounded list expected`)
  const relative = isStr(file, LIMITS.file) && !file.startsWith('/') && !file.includes('..')
  if (file !== undefined && !relative) out.push(`${at}.file: project-relative path expected`)
  if (quality === 'exact') {
    if (!file) out.push(`${at}: exact source needs a file`)
    if (!isNum(line) || line < 1) out.push(`${at}: exact source needs a line`)
    if (provenance === 'none') out.push(`${at}: exact source needs a provenance`)
  }
  const named = isStr(value.component, LIMITS.component)
  if (quality === 'component' && !named) out.push(`${at}: component source needs a component`)
  const located = file !== undefined || line !== undefined || column !== undefined
  if (quality === 'visual-only' && located) out.push(`${at}: visual-only source cannot carry a location`)
  return out
}

function isMemberProperties(value: unknown): boolean {
  return Array.isArray(value) && value.length <= LIMITS.members && value.every(member => isStringMap(member))
}

/** A group's member bounds, in member order. */
function checkMembers(value: unknown, at: string, out: Problems): Problems {
  if (!Array.isArray(value) || value.length > LIMITS.members) return stop(out, `${at}: bounded list expected`)
  value.forEach((rect, i) => checkRect(rect, `${at}[${i}]`, out))
  return out
}

/** The elements a region holds: a non-empty bounded list, each part checked as for an element target. */
function checkContents(value: unknown, at: string, out: Problems): Problems {
  if (!isObj(value)) return stop(out, `${at}: contents expected`)
  if (!oneOf(CONTENTS_MODES, value.mode)) out.push(`${at}.mode: invalid`)
  const { elements, total } = value
  const bounded = Array.isArray(elements) && elements.length > 0 && elements.length <= LIMITS.members
  if (!bounded) return stop(out, `${at}.elements: bounded list expected`)
  if (!isNum(total) || total < elements.length) out.push(`${at}.total: at least the listed count expected`)
  elements.forEach((item, i) => {
    const listed: Obj = isObj(item) ? item : {}
    checkElement(listed.element, `${at}.elements[${i}].element`, out)
    checkRect(listed.bounds, `${at}.elements[${i}].bounds`, out)
    checkSource(listed.source, `${at}.elements[${i}].source`, out)
  })
  return out
}

/** What was measured on one target: bounds, computed properties, its parent, source and contents. */
export function checkEvidence(value: unknown, at: string, out: Problems = []): Problems {
  if (!isObj(value)) return stop(out, `${at}: evidence expected`)
  checkRect(value.bounds, `${at}.bounds`, out)
  if (value.members !== undefined) checkMembers(value.members, `${at}.members`, out)
  if (typeof value.transformed !== 'boolean') out.push(`${at}.transformed: boolean expected`)
  if (!isStringMap(value.properties)) out.push(`${at}.properties: string map expected`)
  const members = value.memberProperties
  if (members !== undefined && !isMemberProperties(members)) {
    out.push(`${at}.memberProperties: list of string maps expected`)
  }
  if (value.parent !== undefined) {
    const parent: Obj = isObj(value.parent) ? value.parent : {}
    checkElement(parent.element, `${at}.parent.element`, out)
    checkRect(parent.bounds, `${at}.parent.bounds`, out)
  }
  checkSource(value.source, `${at}.source`, out)
  if (value.contents !== undefined) checkContents(value.contents, `${at}.contents`, out)
  return out
}

/** Only a region lists the elements it holds. */
function checkHolder(evidence: unknown, operand: unknown, at: string, out: Problems): void {
  const listed = isObj(evidence) && evidence.contents !== undefined
  const region = isObj(operand) && operand.kind === 'region'
  if (listed && !region) out.push(`${at}.contents: only a region lists contents`)
}

/** The conditions the page was seen under, as task.md and the work list show them. */
function checkCapture(value: unknown, at: string, out: Problems): Problems {
  if (!isObj(value)) return stop(out, `${at}: missing`)
  if (!oneOf(FRAMES, value.frame) || value.units !== 'css-px') out.push(`${at}: frame and units expected`)
  if (!hasNumbers(value.viewport, ['width', 'height'])) out.push(`${at}.viewport: width and height expected`)
  if (!hasNumbers(value.scroll, ['x', 'y'])) out.push(`${at}.scroll: x and y expected`)
  if (!hasNumbers(value, ['devicePixelRatio', 'visualScale'])) out.push(`${at}: pixel ratios expected`)
  if (!oneOf(SCHEMES, value.colorScheme)) out.push(`${at}.colorScheme: invalid`)
  if (!isStr(value.location, LIMITS.note)) out.push(`${at}.location: bounded string expected`)
  if (value.screen !== undefined && !isStr(value.screen, LIMITS.label)) out.push(`${at}.screen: too long`)
  if (!isStr(value.capturedAt, LIMITS.name)) out.push(`${at}.capturedAt: bounded string expected`)
  return out
}

function isAxis(value: unknown): boolean {
  return isObj(value) && oneOf(AXES, value.kind) && (value.kind === 'touch' || isNum(value.distance))
}

/** How B sits relative to A: each axis, whether they are diagonal, their overlap and the edge deltas. */
function checkRelation(value: unknown, at: string, out: Problems): Problems {
  if (!isObj(value)) return stop(out, `${at}: relation expected`)
  if (!isAxis(value.horizontal) || !isAxis(value.vertical)) out.push(`${at}: axes expected`)
  if (typeof value.diagonal !== 'boolean') out.push(`${at}.diagonal: boolean expected`)
  if (value.overlap !== null) checkRect(value.overlap, `${at}.overlap`, out)
  if (!hasNumbers(value.delta, DELTA_KEYS)) out.push(`${at}.delta: numbers expected`)
  return out
}

const isField = (value: unknown) => typeof value === 'boolean' || isNum(value) || isStr(value, LIMITS.label)

/** One optional provider's answer: its name, its fields, and whether it failed. */
function isContextEntry(value: unknown): boolean {
  if (!isObj(value) || !isStr(value.provider, LIMITS.name)) return false
  if (value.status !== undefined && !oneOf(PROVIDER_STATUSES, value.status)) return false
  return isObj(value.fields) && Object.values(value.fields).every(isField)
}

/** What the person asked for: a preset and its choices, the scope, what to keep, and the note. */
export function checkIntent(value: unknown, at: string, out: Problems = []): Problems {
  if (!isObj(value)) return stop(out, `${at}: missing`)
  const preset = value.preset
  const known = isObj(preset) && isStr(preset.id, LIMITS.name) && isNum(preset.version)
  if (!known) out.push(`${at}.preset: invalid`)
  if (!isStringMap(value.params, LIMITS.name)) out.push(`${at}.params: invalid`)
  if (!oneOf(SCOPES, value.scope)) out.push(`${at}.scope: invalid`)
  const constraints = value.constraints
  if (!Array.isArray(constraints) || !constraints.every(isConstraint)) out.push(`${at}.constraints: invalid`)
  if (!isStr(value.note, LIMITS.note)) out.push(`${at}.note: too long or missing`)
  return out
}

/** The evidence of an issue: A's, B's exactly when there is a B, the capture, relation and context. */
function checkIssueEvidence(evidence: Obj, operands: Obj, at: string, out: Problems): void {
  checkEvidence(evidence.a, `${at}.evidence.a`, out)
  const missingB = operands.b !== undefined && evidence.b === undefined
  if (missingB) out.push(`${at}.evidence.b: reference evidence missing`)
  if (evidence.b !== undefined) {
    if (operands.b === undefined) out.push(`${at}.operands.b: evidence without a reference operand`)
    checkEvidence(evidence.b, `${at}.evidence.b`, out)
  }
  checkHolder(evidence.a, operands.a, `${at}.evidence.a`, out)
  checkHolder(evidence.b, operands.b, `${at}.evidence.b`, out)
  checkCapture(evidence.capture, `${at}.evidence.capture`, out)
  if (evidence.relation !== undefined) checkRelation(evidence.relation, `${at}.evidence.relation`, out)
  const context = evidence.context
  if (!Array.isArray(context) || !context.every(isContextEntry)) out.push(`${at}.evidence.context: invalid`)
}

/** What a known preset needs of the operands: a reference, a group, or one of the two. */
function checkPresetNeeds(intent: Obj, operands: Obj, at: string, out: Problems, registry?: PresetRegistry) {
  const preset = intent.preset
  if (!registry || !isObj(preset) || typeof preset.id !== 'string') return
  const def = findPreset(registry, preset.id)
  if (!def) return
  const group = isObj(operands.a) && operands.a.kind === 'group'
  const reference = operands.b !== undefined
  const needs = `${at}: preset ${def.id} needs`
  if (def.operands === 'reference' && !reference) out.push(`${needs} a reference operand`)
  if (def.operands === 'group' && !group) out.push(`${needs} a group`)
  if (def.operands === 'compare' && !group && !reference) out.push(`${needs} a group or a reference operand`)
}

export function checkIssue(
  value: unknown,
  at: string,
  out: Problems = [],
  registry?: PresetRegistry,
): Problems {
  if (!isObj(value)) return stop(out, `${at}: issue expected`)
  if (!isId(value.id)) out.push(`${at}.id: invalid`)
  if (!isNum(value.seq) || value.seq < 1) out.push(`${at}.seq: positive number expected`)
  if (!oneOf(STATUSES, value.status)) out.push(`${at}.status: invalid`)
  const { intent, operands, evidence } = value
  if (!isObj(intent)) return stop(out, `${at}.intent: missing`)
  checkIntent(intent, `${at}.intent`, out)
  if (!isObj(operands)) return stop(out, `${at}.operands: missing`)
  checkTarget(operands.a, `${at}.operands.a`, out)
  if (operands.b !== undefined) checkTarget(operands.b, `${at}.operands.b`, out)
  if (!isObj(evidence)) return stop(out, `${at}.evidence: missing`)
  checkIssueEvidence(evidence, operands, at, out)
  const attached = Array.isArray(value.attachments) && value.attachments.every(isId)
  if (!attached) out.push(`${at}.attachments: id list expected`)
  checkPresetNeeds(intent, operands, at, out, registry)
  return out
}

function checkAttachment(value: unknown, at: string, ids: Set<string>, out: Problems): void {
  if (!isObj(value) || !isId(value.id) || !isId(value.issueId)) {
    out.push(`${at}: invalid`)
    return
  }
  if (!oneOf(REVIEWS, value.review)) out.push(`${at}.review: invalid`)
  const image = typeof value.mime === 'string' && attachmentExtension(value.mime) !== undefined
  if (!image) out.push(`${at}.mime: not an image type`)
  const sized = isNum(value.size) && value.size >= 0 && value.size <= ATTACHMENT_MAX_BYTES
  if (!sized) out.push(`${at}.size: invalid`)
  if (!isStr(value.name, LIMITS.text)) out.push(`${at}.name: bounded string expected`)
  ids.add(value.id)
}

/** The batch's attachments, and that every issue names only attachments the batch has. */
function checkAttachments(batch: Obj, out: Problems): void {
  const { attachments, issues } = batch
  if (!Array.isArray(attachments)) {
    out.push('attachments: list expected')
    return
  }
  const ids = new Set<string>()
  attachments.forEach((attachment, i) => checkAttachment(attachment, `attachments[${i}]`, ids, out))
  if (!Array.isArray(issues)) return
  issues.forEach((issue, i) => {
    const refs: unknown[] = isObj(issue) && Array.isArray(issue.attachments) ? issue.attachments : []
    for (const ref of refs) {
      const known = typeof ref === 'string' && ids.has(ref)
      if (!known) out.push(`issues[${i}].attachments: unknown ${String(ref)}`)
    }
  })
}

function batchProblems(value: unknown, registry?: PresetRegistry): Problems {
  if (!isObj(value)) return ['batch: object expected']
  const out: Problems = []
  if (value.schema !== BATCH_SCHEMA) out.push('schema: unknown')
  if (value.version !== BATCH_VERSION) out.push(`version: ${String(value.version)} is not ${BATCH_VERSION}`)
  if (!isId(value.id)) out.push('id: invalid')
  if (!isObj(value.project) || !isId(value.project.id)) out.push('project.id: invalid')
  if (!isObj(value.window) || !isId(value.window.id)) out.push('window.id: invalid')
  if (!oneOf(STATUSES, value.status)) out.push('status: invalid')
  const submitted = value.submittedAt === undefined || isStr(value.submittedAt, LIMITS.name)
  if (!submitted) out.push('submittedAt: invalid')
  const issues = value.issues
  if (!Array.isArray(issues) || issues.length > LIMITS.issues) out.push('issues: bounded list expected')
  else issues.forEach((issue, i) => checkIssue(issue, `issues[${i}]`, out, registry))
  checkAttachments(value, out)
  return out
}

/** No problems: the value is the shape that was checked. */
function holds<T>(_value: unknown, problems: Problems): _value is T {
  return problems.length === 0
}

export function checkBatch(value: unknown, registry?: PresetRegistry): Checked<Batch> {
  const problems = batchProblems(value, registry)
  return holds<Batch>(value, problems) ? { ok: true, value } : { ok: false, problems }
}

// src/core/validate.ts
// Structural validation for batches read from storage, files or a bridge.

import {
  BATCH_SCHEMA,
  BATCH_VERSION,
  CONSTRAINTS,
  type Batch,
  type Issue,
  type SourceRef,
} from './model'
import { findPreset, type PresetRegistry } from './presets'

export const LIMITS = {
  note: 2000,
  label: 120,
  text: 256,
  issues: 500,
  path: 12,
  classes: 8,
}

const ID = /^[A-Za-z0-9_-]{1,64}$/
const SCOPES = new Set(['occurrence', 'screen', 'component'])
const KINDS = new Set(['dom', 'group', 'region'])
const BOUNDARIES = new Set(['canvas', 'iframe', 'closed-root', 'native', 'manual'])
const QUALITIES = new Set(['exact', 'component', 'visual-only'])

export type Problems = string[]

export type Checked<T> = { ok: true, value: T } | { ok: false, problems: Problems }

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown, max = LIMITS.text): v is string => typeof v === 'string' && v.length <= max

export function isId(v: unknown): v is string {
  return typeof v === 'string' && ID.test(v)
}

function rect(v: unknown, at: string, out: Problems) {
  if (!isObj(v)) return void out.push(`${at}: rect expected`)
  for (const k of ['x', 'y', 'width', 'height']) {
    if (!isNum(v[k])) out.push(`${at}.${k}: finite number expected`)
  }
  if (isNum(v.width) && v.width < 0) out.push(`${at}.width: negative`)
  if (isNum(v.height) && v.height < 0) out.push(`${at}.height: negative`)
}

function element(v: unknown, at: string, out: Problems) {
  if (!isObj(v)) return void out.push(`${at}: element descriptor expected`)
  if (!isStr(v.tag, 64) || !v.tag) out.push(`${at}.tag: missing`)
  for (const k of ['role', 'id', 'testId']) {
    if (v[k] !== undefined && !isStr(v[k])) out.push(`${at}.${k}: bounded string expected`)
  }
  if (v.label !== undefined && !isStr(v.label, LIMITS.label)) out.push(`${at}.label: too long`)
  if (!Array.isArray(v.classes) || v.classes.length > LIMITS.classes || !v.classes.every(c => isStr(c, 64))) {
    out.push(`${at}.classes: bounded list expected`)
  }
  if (!Array.isArray(v.path) || v.path.length > LIMITS.path || !v.path.every(c => isStr(c, 128))) {
    out.push(`${at}.path: bounded list expected`)
  }
  if (!isNum(v.shadowDepth) || v.shadowDepth < 0) out.push(`${at}.shadowDepth: expected`)
  if (v.occurrence !== undefined) {
    const o = v.occurrence
    if (!isObj(o) || !isNum(o.index) || !isNum(o.count) || o.index < 0 || o.index >= o.count) {
      out.push(`${at}.occurrence: invalid`)
    }
    else if (o.item !== undefined && !isStr(o.item, LIMITS.label)) out.push(`${at}.occurrence.item: too long`)
  }
}

function target(v: unknown, at: string, out: Problems) {
  if (!isObj(v) || !KINDS.has(v.kind as string)) return void out.push(`${at}: target kind expected`)
  if (v.kind === 'dom') element(v.element, `${at}.element`, out)
  if (v.kind === 'group') {
    if (!Array.isArray(v.members) || v.members.length < 2) out.push(`${at}.members: two or more expected`)
    else v.members.forEach((m, i) => element(m, `${at}.members[${i}]`, out))
    if (v.anchor !== undefined && (!isNum(v.anchor) || !Array.isArray(v.members) || v.anchor < 0 || v.anchor >= v.members.length)) {
      out.push(`${at}.anchor: out of range`)
    }
  }
  if (v.kind === 'region') {
    rect(v.rect, `${at}.rect`, out)
    if (v.frame !== 'viewport' && v.frame !== 'document') out.push(`${at}.frame: invalid`)
    if (!BOUNDARIES.has(v.boundary as string)) out.push(`${at}.boundary: invalid`)
  }
}

export function checkSource(v: unknown, at: string, out: Problems) {
  if (!isObj(v) || !QUALITIES.has(v.quality as string)) return void out.push(`${at}.quality: invalid`)
  if (!isStr(v.provenance, 64) || !v.provenance) out.push(`${at}.provenance: missing`)
  const s = v as unknown as SourceRef
  if (s.file !== undefined && (!isStr(s.file, 512) || s.file.startsWith('/') || s.file.includes('..'))) {
    out.push(`${at}.file: project-relative path expected`)
  }
  if (s.quality === 'exact') {
    if (!s.file) out.push(`${at}: exact source needs a file`)
    if (!isNum(s.line) || s.line < 1) out.push(`${at}: exact source needs a line`)
    if (s.provenance === 'none') out.push(`${at}: exact source needs a provenance`)
  }
  if (s.quality === 'component' && !isStr(s.component, 128)) out.push(`${at}: component source needs a component`)
  if (s.quality === 'visual-only' && (s.file !== undefined || s.line !== undefined || s.column !== undefined)) {
    out.push(`${at}: visual-only source cannot carry a location`)
  }
}

function targetEvidence(v: unknown, at: string, out: Problems) {
  if (!isObj(v)) return void out.push(`${at}: evidence expected`)
  rect(v.bounds, `${at}.bounds`, out)
  if (typeof v.transformed !== 'boolean') out.push(`${at}.transformed: boolean expected`)
  if (!isObj(v.properties) || !Object.values(v.properties).every(p => isStr(p))) out.push(`${at}.properties: string map expected`)
  if (v.memberProperties !== undefined && (!Array.isArray(v.memberProperties) || v.memberProperties.length > 64 || !v.memberProperties.every(m => isObj(m) && Object.values(m).every(p => isStr(p))))) {
    out.push(`${at}.memberProperties: list of string maps expected`)
  }
  checkSource(v.source, `${at}.source`, out)
}

export function checkIssue(v: unknown, at: string, out: Problems, registry?: PresetRegistry) {
  if (!isObj(v)) return void out.push(`${at}: issue expected`)
  if (!isId(v.id)) out.push(`${at}.id: invalid`)
  if (!isNum(v.seq) || v.seq < 1) out.push(`${at}.seq: positive number expected`)
  if (v.status !== 'draft' && v.status !== 'submitted') out.push(`${at}.status: invalid`)
  const intent = v.intent
  if (!isObj(intent)) return void out.push(`${at}.intent: missing`)
  const preset = intent.preset
  if (!isObj(preset) || !isStr(preset.id, 64) || !isNum(preset.version)) out.push(`${at}.intent.preset: invalid`)
  if (!isObj(intent.params) || !Object.values(intent.params).every(p => isStr(p, 64))) out.push(`${at}.intent.params: invalid`)
  if (!SCOPES.has(intent.scope as string)) out.push(`${at}.intent.scope: invalid`)
  if (!Array.isArray(intent.constraints) || !intent.constraints.every(c => (CONSTRAINTS as readonly unknown[]).includes(c))) {
    out.push(`${at}.intent.constraints: invalid`)
  }
  if (!isStr(intent.note, LIMITS.note)) out.push(`${at}.intent.note: too long or missing`)

  const ops = v.operands
  if (!isObj(ops)) return void out.push(`${at}.operands: missing`)
  target(ops.a, `${at}.operands.a`, out)
  if (ops.b !== undefined) target(ops.b, `${at}.operands.b`, out)

  const ev = v.evidence
  if (!isObj(ev)) return void out.push(`${at}.evidence: missing`)
  targetEvidence(ev.a, `${at}.evidence.a`, out)
  if (ops.b !== undefined && ev.b === undefined) out.push(`${at}.evidence.b: reference evidence missing`)
  if (ev.b !== undefined) {
    if (ops.b === undefined) out.push(`${at}.operands.b: evidence without a reference operand`)
    targetEvidence(ev.b, `${at}.evidence.b`, out)
  }
  if (!isObj(ev.capture)) out.push(`${at}.evidence.capture: missing`)
  if (!Array.isArray(ev.context)) out.push(`${at}.evidence.context: list expected`)
  if (!Array.isArray(v.attachments) || !v.attachments.every(isId)) out.push(`${at}.attachments: id list expected`)

  if (registry && isObj(preset) && typeof preset.id === 'string') {
    const def = findPreset(registry, preset.id)
    if (def && def.operands === 'reference' && ops.b === undefined) out.push(`${at}: preset ${def.id} needs a reference operand`)
    if (def && def.operands === 'group' && (ops.a as Obj | undefined)?.kind !== 'group') out.push(`${at}: preset ${def.id} needs a group`)
    if (def && def.operands === 'compare' && (ops.a as Obj | undefined)?.kind !== 'group' && ops.b === undefined) out.push(`${at}: preset ${def.id} needs a group or a reference operand`)
  }
}

export function checkBatch(v: unknown, registry?: PresetRegistry): Checked<Batch> {
  const out: Problems = []
  if (!isObj(v)) return { ok: false, problems: ['batch: object expected'] }
  if (v.schema !== BATCH_SCHEMA) out.push('schema: unknown')
  if (v.version !== BATCH_VERSION) out.push(`version: ${String(v.version)} is not ${BATCH_VERSION}`)
  if (!isId(v.id)) out.push('id: invalid')
  if (!isObj(v.project) || !isId(v.project.id)) out.push('project.id: invalid')
  if (!isObj(v.window) || !isId(v.window.id)) out.push('window.id: invalid')
  if (v.status !== 'draft' && v.status !== 'submitted') out.push('status: invalid')
  if (!Array.isArray(v.issues) || v.issues.length > LIMITS.issues) out.push('issues: bounded list expected')
  else v.issues.forEach((issue, i) => checkIssue(issue, `issues[${i}]`, out, registry))
  if (!Array.isArray(v.attachments)) out.push('attachments: list expected')
  else {
    const ids = new Set<string>()
    v.attachments.forEach((a, i) => {
      if (!isObj(a) || !isId(a.id) || !isId(a.issueId)) return void out.push(`attachments[${i}]: invalid`)
      if (a.review !== 'pending' && a.review !== 'approved') out.push(`attachments[${i}].review: invalid`)
      if (!isStr(a.mime, 64) || !isNum(a.size)) out.push(`attachments[${i}]: mime and size expected`)
      ids.add(a.id)
    })
    if (Array.isArray(v.issues)) {
      v.issues.forEach((issue, i) => {
        const refs = isObj(issue) && Array.isArray(issue.attachments) ? issue.attachments : []
        for (const ref of refs) if (!ids.has(ref as string)) out.push(`issues[${i}].attachments: unknown ${String(ref)}`)
      })
    }
  }
  return out.length ? { ok: false, problems: out } : { ok: true, value: v as unknown as Batch }
}

export function checkIssueAlone(v: unknown, registry?: PresetRegistry): Checked<Issue> {
  const out: Problems = []
  checkIssue(v, 'issue', out, registry)
  return out.length ? { ok: false, problems: out } : { ok: true, value: v as Issue }
}

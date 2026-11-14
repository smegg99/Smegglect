// src/core/presets.ts
// Preset definitions: data only. Imported batches name a preset id; they never carry code.

import { BUILT_IN } from './built-in-presets'
import type { TargetKind } from './model'

export type PresetCategory =
  | 'size'
  | 'spacing'
  | 'align'
  | 'match'
  | 'consistency'
  | 'content'
  | 'style'
  | 'behaviour'
  | 'access'
  | 'layout'
  | 'note'

/**
 * single: A only. reference: A and B. group: A is a group, optionally with an anchor member.
 * compare: a group compares its members; a single element is compared with a reference B.
 */
export type OperandNeed = 'single' | 'reference' | 'group' | 'compare'

export type EvidenceNeed = 'box' | 'spacing' | 'type' | 'overflow' | 'style' | 'parent'

export interface PresetChoice {
  key: string
  options: readonly string[]
}

export interface PresetDef {
  id: string
  version: number
  category: PresetCategory
  icon: string
  applies: readonly TargetKind[]
  operands: OperandNeed
  /** Asked before the issue is added; the answer lands in `intent.params[key]`. */
  choice?: PresetChoice
  evidence: readonly EvidenceNeed[]
  /** Computed properties (or `width`/`height` from rendered bounds) shown side by side and exported. */
  compare?: readonly string[]
  note: 'none' | 'optional' | 'required'
  /** Project presets carry plain text instead of locale keys. */
  label?: string
  /** Project presets: task sentence with `{a}`, `{b}` and `{choice}` placeholders. */
  summary?: string
}

export interface PresetRegistry {
  list: readonly PresetDef[]
  byId: ReadonlyMap<string, PresetDef>
}

const PROJECT_ID = /^project\.[a-z0-9-]{1,48}$/

/** Project presets must use the `project.` namespace and plain-text label and summary. */
export function checkProjectPreset(def: PresetDef): string[] {
  const out: string[] = []
  if (!PROJECT_ID.test(def.id)) out.push(`${def.id}: project preset ids look like project.name`)
  if (!def.label || def.label.length > 60) out.push(`${def.id}: label of 1-60 characters expected`)
  if (!def.summary || def.summary.length > 240) out.push(`${def.id}: summary of 1-240 characters expected`)
  if (!def.applies.length) out.push(`${def.id}: applies is empty`)
  if (!Number.isInteger(def.version) || def.version < 1) out.push(
    `${def.id}: version must be a positive integer`,
  )
  for (const field of Object.values(def)) if (typeof field === 'function') out.push(
    `${def.id}: functions are not allowed`,
  )
  return out
}

export function createRegistry(project: readonly PresetDef[] = []): PresetRegistry {
  const problems = project.flatMap(checkProjectPreset)
  if (problems.length) throw new Error(`smegglect: invalid project presets: ${problems.join('; ')}`)
  const list = [...BUILT_IN, ...project.map(preset => ({ ...preset }))]
  const byId = new Map(list.map(preset => [preset.id, preset]))
  if (byId.size !== list.length) throw new Error('smegglect: duplicate preset id')
  return { list, byId }
}

export function findPreset(registry: PresetRegistry, id: string): PresetDef | undefined {
  return registry.byId.get(id)
}

/** Unknown ids and newer versions stay readable but cannot be edited further. */
export function editable(registry: PresetRegistry, preset: { id: string, version: number }): boolean {
  const def = registry.byId.get(preset.id)
  return !!def && def.version === preset.version
}

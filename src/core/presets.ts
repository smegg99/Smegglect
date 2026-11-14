// src/core/presets.ts
// Preset definitions: data only. Imported batches name a preset id; they never carry code.

import type { TargetKind } from './model'

export type PresetCategory = 'size' | 'spacing' | 'align' | 'match' | 'consistency' | 'content' | 'style' | 'behaviour' | 'access' | 'layout' | 'note'

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

export const BUILT_IN: readonly PresetDef[] = [
  {
    id: 'size', version: 1, category: 'size', icon: 'size', applies: ['dom', 'region'], operands: 'single',
    choice: { key: 'observed', options: ['too-wide', 'too-narrow', 'too-tall', 'too-short', 'too-large', 'too-small'] },
    compare: ['width', 'height', 'min-width', 'max-width'], evidence: ['box', 'parent'], note: 'optional',
  },
  {
    id: 'spacing', version: 1, category: 'spacing', icon: 'spacing', applies: ['dom', 'region'], operands: 'single',
    choice: { key: 'observed', options: ['excessive', 'cramped'] },
    compare: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    evidence: ['box', 'spacing', 'parent'], note: 'optional',
  },
  {
    id: 'align', version: 1, category: 'align', icon: 'align', applies: ['dom', 'group'], operands: 'reference',
    choice: { key: 'edge', options: ['left', 'right', 'top', 'bottom', 'center-x', 'center-y'] },
    evidence: ['box'], note: 'none',
  },
  {
    id: 'group-align', version: 1, category: 'align', icon: 'align', applies: ['group'], operands: 'group',
    choice: { key: 'edge', options: ['left', 'right', 'top', 'bottom', 'center-x', 'center-y'] },
    evidence: ['box'], note: 'none',
  },
  {
    id: 'match-height', version: 1, category: 'match', icon: 'matchHeight', applies: ['dom', 'group'], operands: 'reference',
    compare: ['height'], evidence: ['box'], note: 'none',
  },
  {
    id: 'match-width', version: 1, category: 'match', icon: 'matchWidth', applies: ['dom', 'group'], operands: 'reference',
    compare: ['width'], evidence: ['box'], note: 'none',
  },
  {
    id: 'equal-gaps', version: 1, category: 'spacing', icon: 'equalGaps', applies: ['group'], operands: 'group',
    choice: { key: 'axis', options: ['horizontal', 'vertical'] },
    evidence: ['box'], note: 'none',
  },
  {
    id: 'clipped', version: 1, category: 'content', icon: 'clipped', applies: ['dom', 'region'], operands: 'single',
    compare: ['scroll-width', 'client-width', 'scroll-height', 'client-height', 'text-overflow'], evidence: ['box', 'overflow', 'type'], note: 'optional',
  },
  {
    id: 'overlap', version: 1, category: 'content', icon: 'overlap', applies: ['dom'], operands: 'reference',
    evidence: ['box'], note: 'optional',
  },
  {
    id: 'readability', version: 1, category: 'content', icon: 'readability', applies: ['dom', 'region'], operands: 'single',
    choice: { key: 'observed', options: ['low-contrast', 'too-small-text', 'too-dense'] },
    compare: ['font-size', 'line-height', 'color', 'background-color'], evidence: ['type', 'style'], note: 'optional',
  },
  {
    id: 'inconsistent', version: 1, category: 'style', icon: 'inconsistent', applies: ['dom'], operands: 'reference',
    evidence: ['style', 'type', 'box'], note: 'optional',
  },
  {
    id: 'feedback', version: 1, category: 'behaviour', icon: 'feedback', applies: ['dom', 'region'], operands: 'single',
    choice: { key: 'observed', options: ['does-nothing', 'wrong-result'] },
    evidence: ['box'], note: 'required',
  },
  {
    id: 'layout', version: 1, category: 'layout', icon: 'layout', applies: ['region'], operands: 'single',
    choice: { key: 'observed', options: ['misaligned', 'crowded', 'missing-content', 'broken'] },
    evidence: [], note: 'optional',
  },
  {
    id: 'note', version: 1, category: 'note', icon: 'note', applies: ['dom', 'group', 'region'], operands: 'single',
    evidence: ['box'], note: 'required',
  },
  {
    id: 'touch-target', version: 1, category: 'size', icon: 'touch', applies: ['dom'], operands: 'single',
    compare: ['width', 'height'], evidence: ['box'], note: 'optional',
  },
  {
    id: 'overflow', version: 1, category: 'layout', icon: 'overflow', applies: ['dom', 'region'], operands: 'single',
    choice: { key: 'observed', options: ['sticks-out', 'unwanted-scrollbar', 'pushes-layout'] },
    compare: ['scroll-width', 'client-width', 'scroll-height', 'client-height', 'overflow-x', 'overflow-y'], evidence: ['box', 'overflow', 'parent'], note: 'optional',
  },
  {
    id: 'center', version: 1, category: 'align', icon: 'alignCenterX', applies: ['dom'], operands: 'single',
    choice: { key: 'axis', options: ['horizontal', 'vertical', 'both'] },
    evidence: ['box', 'parent'], note: 'optional',
  },
  {
    id: 'text-wrong', version: 1, category: 'content', icon: 'textWrong', applies: ['dom', 'region'], operands: 'single',
    choice: { key: 'observed', options: ['typo', 'unclear', 'not-translated', 'placeholder'] },
    evidence: [], note: 'optional',
  },
  {
    id: 'text-wrap', version: 1, category: 'content', icon: 'wrap', applies: ['dom'], operands: 'single',
    choice: { key: 'observed', options: ['breaks-badly', 'should-not-wrap', 'should-wrap'] },
    compare: ['white-space', 'width', 'max-width'], evidence: ['type', 'box'], note: 'optional',
  },
  {
    id: 'wrong-color', version: 1, category: 'style', icon: 'palette', applies: ['dom'], operands: 'single',
    choice: { key: 'part', options: ['text', 'background', 'border', 'icon'] },
    compare: ['color', 'background-color', 'border-top-color'], evidence: ['style'], note: 'optional',
  },
  {
    id: 'icon', version: 1, category: 'style', icon: 'shapes', applies: ['dom'], operands: 'single',
    choice: { key: 'observed', options: ['wrong-icon', 'missing-icon', 'blurry', 'icon-size'] },
    compare: ['width', 'height'], evidence: ['box'], note: 'optional',
  },
  {
    id: 'state-missing', version: 1, category: 'behaviour', icon: 'cursor', applies: ['dom'], operands: 'single',
    choice: { key: 'state', options: ['hover', 'focus', 'pressed', 'disabled', 'loading', 'empty', 'error'] },
    evidence: ['style', 'box'], note: 'optional',
  },
  {
    id: 'keyboard', version: 1, category: 'access', icon: 'keyboard', applies: ['dom', 'region'], operands: 'single',
    choice: { key: 'observed', options: ['not-focusable', 'focus-order', 'focus-trap'] },
    evidence: ['box'], note: 'optional',
  },
  {
    id: 'a11y-name', version: 1, category: 'access', icon: 'label', applies: ['dom'], operands: 'single',
    choice: { key: 'observed', options: ['no-name', 'wrong-name'] },
    evidence: ['box'], note: 'optional',
  },
  {
    id: 'responsive', version: 1, category: 'layout', icon: 'responsive', applies: ['dom', 'region'], operands: 'single',
    choice: { key: 'width', options: ['narrow', 'wide', 'zoom'] },
    evidence: ['box', 'parent'], note: 'optional',
  },
  {
    id: 'consistent-padding', version: 1, category: 'consistency', icon: 'padding', applies: ['dom', 'group'], operands: 'compare',
    compare: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], evidence: ['box', 'spacing'], note: 'optional',
  },
  {
    id: 'consistent-margin', version: 1, category: 'consistency', icon: 'margin', applies: ['dom', 'group'], operands: 'compare',
    compare: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'], evidence: ['box', 'spacing'], note: 'optional',
  },
  {
    id: 'consistent-gap', version: 1, category: 'consistency', icon: 'equalGaps', applies: ['dom', 'group'], operands: 'compare',
    compare: ['row-gap', 'column-gap'], evidence: ['box', 'spacing'], note: 'optional',
  },
  {
    id: 'consistent-size', version: 1, category: 'consistency', icon: 'size', applies: ['dom', 'group'], operands: 'compare',
    compare: ['width', 'height'], evidence: ['box'], note: 'optional',
  },
  {
    id: 'consistent-radius', version: 1, category: 'consistency', icon: 'radius', applies: ['dom', 'group'], operands: 'compare',
    compare: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'], evidence: ['style'], note: 'optional',
  },
  {
    id: 'consistent-type', version: 1, category: 'consistency', icon: 'readability', applies: ['dom', 'group'], operands: 'compare',
    compare: ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'], evidence: ['type'], note: 'optional',
  },
  {
    id: 'consistent-color', version: 1, category: 'consistency', icon: 'inconsistent', applies: ['dom', 'group'], operands: 'compare',
    compare: ['color', 'background-color', 'border-top-color'], evidence: ['style'], note: 'optional',
  },
  {
    id: 'off-scale', version: 1, category: 'consistency', icon: 'ruler', applies: ['dom'], operands: 'single',
    choice: { key: 'scale', options: ['grid-4', 'grid-8'] },
    compare: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap', 'width', 'height'],
    evidence: ['box', 'spacing'], note: 'optional',
  },
]

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
  if (!Number.isInteger(def.version) || def.version < 1) out.push(`${def.id}: version must be a positive integer`)
  for (const v of Object.values(def)) if (typeof v === 'function') out.push(`${def.id}: functions are not allowed`)
  return out
}

export function createRegistry(project: readonly PresetDef[] = []): PresetRegistry {
  const problems = project.flatMap(checkProjectPreset)
  if (problems.length) throw new Error(`smegglect: invalid project presets: ${problems.join('; ')}`)
  const list = [...BUILT_IN, ...project.map(p => ({ ...p }))]
  const byId = new Map(list.map(p => [p.id, p]))
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

export function applicable(def: PresetDef, kind: TargetKind): boolean {
  return def.applies.includes(kind)
}

// src/overlay/labels.ts
// Localized names for presets, choices and targets. Captured page text is shown as data, never markup.

import type { Issue, TargetRef } from '../core/model'
import type { PresetDef, PresetRegistry } from '../core/presets'
import { chipOf } from '../dom/describe'
import type { Translate } from './i18n'

const camel = (s: string) => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())

export function presetLabel(def: PresetDef | undefined, id: string, t: Translate): string {
  if (def?.label) return def.label
  return t(`preset.${camel(def?.id ?? id)}`) || id
}

export function choiceLabel(def: PresetDef | undefined, option: string, t: Translate): string {
  if (!def || def.label) return option
  return t(`choice.${camel(option)}`) || option
}

/** Presets whose choice names a property of the action rather than an observation. */
const PREFIXED = new Set(['align', 'group-align', 'equal-gaps'])

export function issueTitle(issue: Issue, registry: PresetRegistry, t: Translate): string {
  const id = issue.intent.preset.id
  const def = registry.byId.get(id)
  const key = def?.choice?.key
  const option = key ? issue.intent.params[key] : undefined
  if (!option) return presetLabel(def, id, t)
  const choice = choiceLabel(def, option, t)
  return PREFIXED.has(id) ? `${presetLabel(def, id, t)}: ${choice}` : choice
}

export function targetText(ref: TargetRef, t: Translate): string {
  if (ref.kind === 'dom') return chipOf(ref.element)
  if (ref.kind === 'group') return t('strip.elements', { count: ref.members.length })
  return t('strip.region')
}

export function operandsText(issue: Issue, t: Translate): string {
  const a = targetText(issue.operands.a, t)
  return issue.operands.b ? `${a} ${t('drawer.toB', { target: targetText(issue.operands.b, t) })}` : a
}

const DESCRIBE: Record<string, string> = {
  'size': 'issue.size', 'spacing': 'issue.spacing', 'align': 'issue.align', 'group-align': 'issue.groupAlign',
  'match-height': 'issue.matchHeight', 'match-width': 'issue.matchWidth', 'equal-gaps': 'issue.equalGaps',
  'clipped': 'issue.clipped', 'overlap': 'issue.overlap', 'readability': 'issue.readability',
  'inconsistent': 'issue.inconsistent', 'feedback': 'issue.feedback', 'layout': 'issue.layout', 'note': 'issue.note',
  'off-scale': 'issue.offScale', 'touch-target': 'issue.touchTarget', 'overflow': 'issue.overflow', 'center': 'issue.center',
  'text-wrong': 'issue.textWrong', 'text-wrap': 'issue.textWrap', 'wrong-color': 'issue.wrongColor', 'icon': 'issue.icon',
  'state-missing': 'issue.stateMissing', 'keyboard': 'issue.keyboard', 'a11y-name': 'issue.a11yName', 'responsive': 'issue.responsive',
}

export interface Subject {
  preset: string
  params: Record<string, string>
  a: string
  b?: string
  count: number
}

/** One readable sentence for an issue or a composed one, in the overlay's language. */
export function describe(sub: Subject, registry: PresetRegistry, t: Translate): string {
  const def = registry.byId.get(sub.preset)
  const key = def?.choice?.key
  const option = key ? sub.params[key] : undefined
  const choice = option ? choiceLabel(def, option, t).toLowerCase() : ''
  if (def?.label) return `${def.label}: ${sub.a}${sub.b ? ` / ${sub.b}` : ''}`
  if (sub.preset.startsWith('consistent-')) {
    const name = presetLabel(def, sub.preset, t)
    const what = sub.b ? t('issue.compareB', { a: sub.a, b: sub.b }) : t('issue.compareGroup', { count: sub.count })
    return `${name}: ${what}`
  }
  const msg = DESCRIBE[sub.preset]
  return msg ? t(msg, { a: sub.a, b: sub.b ?? '', choice, count: sub.count }) : presetLabel(def, sub.preset, t)
}

export function subjectOf(issue: Issue, t: Translate): Subject {
  const a = issue.operands.a
  const count = a.kind === 'group' ? a.members.length : 1
  const name = (ref: TargetRef) => ref.kind === 'dom' ? chipOf(ref.element) : ref.kind === 'group' ? t('issue.group', { count: ref.members.length }) : t('issue.region')
  return {
    preset: issue.intent.preset.id,
    params: issue.intent.params,
    a: name(a),
    ...(issue.operands.b ? { b: name(issue.operands.b) } : {}),
    count,
  }
}

/** Short page label: the path, or the screen name the host reports. */
export function pageLabel(location: string, screen?: string): string {
  if (screen) return screen
  try {
    const u = new URL(location)
    return u.pathname === '/' ? u.host : u.pathname.replace(/^\//, '')
  }
  catch {
    return location
  }
}

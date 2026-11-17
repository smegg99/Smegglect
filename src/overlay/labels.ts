// src/overlay/labels.ts
// Localized names for presets, choices and targets. Captured page text is shown as data, never markup.

import type { Issue, TargetRef } from '../core/model'
import type { PresetDef, PresetRegistry } from '../core/presets'
import type { IssueProgress } from '../core/review'
import { chipOf } from '../dom/describe'
import type { Translate } from './i18n'

/** `too-wide` reads `tooWide` and `grid-4` reads `grid4`, as the locale keys are written. */
const camel = (words: string) => words.replace(/-([a-z0-9])/g, (_whole, next: string) => next.toUpperCase())

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

const DESCRIBE: Record<string, string> = {
  'size': 'issue.size', 'spacing': 'issue.spacing', 'align': 'issue.align', 'group-align': 'issue.groupAlign',
  'match-height': 'issue.matchHeight', 'match-width': 'issue.matchWidth', 'equal-gaps': 'issue.equalGaps',
  'clipped': 'issue.clipped', 'unnecessary-ellipsis': 'issue.unnecessaryEllipsis',
  'overlap': 'issue.overlap', 'readability': 'issue.readability',
  'inconsistent': 'issue.inconsistent', 'feedback': 'issue.feedback',
  'layout': 'issue.layout', 'note': 'issue.note',
  'off-scale': 'issue.offScale', 'touch-target': 'issue.touchTarget',
  'overflow': 'issue.overflow', 'center': 'issue.center',
  'text-wrong': 'issue.textWrong', 'text-wrap': 'issue.textWrap',
  'wrong-color': 'issue.wrongColor', 'icon': 'issue.icon',
  'state-missing': 'issue.stateMissing', 'keyboard': 'issue.keyboard',
  'a11y-name': 'issue.a11yName', 'responsive': 'issue.responsive',
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
    const what = sub.b
      ? t('issue.compareB', { a: sub.a, b: sub.b })
      : t('issue.compareGroup', { count: sub.count })
    return `${name}: ${what}`
  }
  const msg = DESCRIBE[sub.preset]
  return msg
    ? t(msg, { a: sub.a, b: sub.b ?? '', choice, count: sub.count })
    : presetLabel(def, sub.preset, t)
}

/** A target as the overlay names it: an element by its label, a group by its size, or a region. */
function targetName(ref: TargetRef, t: Translate): string {
  if (ref.kind === 'dom') return chipOf(ref.element)
  if (ref.kind === 'group') return t('issue.group', { count: ref.members.length })
  return t('issue.region')
}

export function subjectOf(issue: Issue, t: Translate): Subject {
  const a = issue.operands.a
  const count = a.kind === 'group' ? a.members.length : 1
  const name = (ref: TargetRef) => targetName(ref, t)
  const b = issue.operands.b
  return {
    preset: issue.intent.preset.id,
    params: issue.intent.params,
    a: name(a),
    b: b ? name(b) : undefined,
    count,
  }
}

/** Short page label: the path, or the screen name the host reports. */
export function pageLabel(location: string, screen?: string): string {
  if (screen) return screen
  try {
    const url = new URL(location)
    return url.pathname === '/' ? url.host : url.pathname.replace(/^\//, '')
  }
  catch {
    return location
  }
}

const STATUS_KEYS: Record<string, string> = {
  unavailable: 'drawer.statusUnavailable',
  ambiguous: 'drawer.statusAmbiguous',
  elsewhere: 'drawer.statusElsewhere',
  hidden: 'drawer.statusHidden',
}

/** Why an issue's target is not drawn on this page; nothing while it is. */
export function statusText(status: string | undefined, t: Translate): string {
  const key = status === undefined ? undefined : STATUS_KEYS[status]
  return key ? t(key) : ''
}

/** A short date and time in the overlay's language; the stored text when it is not a date. */
export function shortTime(at: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(at))
  }
  catch {
    return at
  }
}

/** Each state's icon and words; only the ones that need the person are coloured. */
const PROGRESS: Record<IssueProgress, { icon: string, key: string, warn?: boolean }> = {
  'waiting': { icon: 'away', key: 'bridge.issueWaiting' },
  'taken': { icon: 'taken', key: 'bridge.issueTakenClaude' },
  'in-progress': { icon: 'working', key: 'bridge.issueWorking' },
  'needs-review': { icon: 'check', key: 'bridge.issueFixed' },
  'partial': { icon: 'partial', key: 'bridge.issuePartial' },
  'blocked': { icon: 'blocked', key: 'bridge.issueBlocked', warn: true },
  'stalled': { icon: 'stalled', key: 'bridge.issueStalled', warn: true },
}

/** How far the agent has got with a sent issue, as an icon and the page's own words. */
export function progressOf(
  progress: IssueProgress,
  kind: 'claude' | 'other' | null,
  t: Translate,
): { icon: string, text: string, warn: boolean } {
  const { icon, key, warn } = PROGRESS[progress]
  const named = progress === 'taken' && kind !== 'claude' ? 'bridge.issueTakenOther' : key
  return { icon, text: t(named), warn: !!warn }
}

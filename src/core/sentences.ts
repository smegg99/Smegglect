// src/core/sentences.ts
// The task sentence of each preset, as a table from preset id to its sentence, and the words it uses.
// English, agent-neutral; an agent reads these, so they say what to change and what stays.

import { gridScale } from './compare'
import { INTERFACE_SENTENCES, INTERFACE_UNSPECIFIED, type Sentence } from './interface-sentences'
import { lookup } from './lookup'
import type { ConstraintId, Issue, Scope } from './model'
import type { PresetDef, PresetRegistry } from './presets'

export const SCOPE: Record<Scope, string> = {
  occurrence: 'Change only this occurrence.',
  screen: 'The change may apply across this screen.',
  component: 'The change belongs in the shared component; other instances will change with it.',
}

export const KEEP: Record<ConstraintId, string> = {
  'keep-responsive': 'responsive behaviour',
  'keep-tokens': 'existing theme tokens instead of new literal values',
  'no-fixed-size': 'no new fixed pixel sizes',
  'keep-behaviour': 'existing behaviour',
  'keep-other-instances': 'other instances of the component unchanged',
  'keep-text': 'the text content',
}

const EDGE: Record<string, string> = {
  'left': 'left edge',
  'right': 'right edge',
  'top': 'top edge',
  'bottom': 'bottom edge',
  'center-x': 'horizontal centre',
  'center-y': 'vertical centre',
}

const OVERFLOW: Record<string, string> = {
  'sticks-out': 'it sticks out',
  'unwanted-scrollbar': 'it shows a scrollbar it should not',
  'pushes-layout': 'it pushes the layout wider',
}

const TEXT: Record<string, string> = {
  'typo': 'a typo',
  'unclear': 'unclear wording',
  'not-translated': 'not translated',
  'poor-translation': 'a poor translation',
  'placeholder': 'placeholder text left in',
}

const ICON: Record<string, string> = {
  'wrong-icon': 'wrong icon',
  'missing-icon': 'icon missing',
  'blurry': 'blurry',
  'icon-size': 'wrong size',
}

const KEYBOARD: Record<string, string> = {
  'not-focusable': 'cannot be reached with Tab',
  'focus-order': 'focus moves in the wrong order',
  'focus-trap': 'focus gets stuck',
}

/** Where a responsive layout breaks; narrow screens unless said otherwise. */
const BREAKS: Record<string, string> = {
  zoom: 'when the page is zoomed in',
  wide: 'on wide screens',
}

const ASPECT: Record<string, string> = {
  padding: 'padding',
  margin: 'margin',
  gap: 'gap between children',
  size: 'width and height',
  radius: 'corner radius',
  type: 'typography',
  color: 'colours',
}

/** A choice as words: `too-wide` reads `too wide`. */
const words = (choice: string | undefined) => (choice ?? '').replace(/-/g, ' ')

/** A choice as the table describes it, else as words. */
const described = (table: Record<string, string>, choice: string | undefined) => {
  return lookup(table, choice) ?? words(choice)
}

const edgeOf = (choice: string | undefined) => lookup(EDGE, choice) ?? 'edge'

/** Untrusted page text, quoted and unable to break the Markdown around it. */
export function quote(text: string): string {
  return `"${text.replace(/[\\"`<>|*_[\]#]/g, mark => `\\${mark}`).replace(/\s+/g, ' ')}"`
}

const REFERENCE_STAYS = 'B is the reference and stays as it is.'

/** The anchor's place in its group, counted from 1; the first member when none was chosen. */
function anchorNumber(issue: Issue): number {
  const a = issue.operands.a
  return a.kind === 'group' && a.anchor !== undefined ? a.anchor + 1 : 1
}

function centreAxis(axis: string | undefined): string {
  if (axis === 'both') return 'horizontally and vertically'
  return axis ?? 'horizontally'
}

/** A space a person picked while measuring: `padding-top`, `margin-left` or `gap`, as words about A. */
function spaceWords(space: string): string {
  if (space === 'gap') return 'the gap between the members of A'
  const [kind, side] = space.split('-')
  return `the ${side ?? ''} ${kind ?? ''} of A`.replace(/ {2,}/g, ' ')
}

/** Spacing on one named space: how it is wrong, or that it is, when the person did not say. */
function spaceSentence(space: string, observed: string | undefined): string {
  const what = spaceWords(space)
  if (observed === 'excessive') return `Reported: ${what} is too large.`
  if (observed === 'cramped') return `Reported: ${what} is too small.`
  return `Reported: ${what} is wrong. The note says how, when there is one.`
}

function stateName(state: string | undefined): string {
  if (state === 'focus') return 'focus ring'
  return `${state ?? 'hover'} state`
}

const SENTENCES: Record<string, Sentence> = {
  'size': ({ params }) => `Reported: A is ${words(params.observed)}. Find what sets its size and correct it.`,
  'spacing': ({ params }) => {
    const amount = params.observed === 'cramped' ? 'too little' : 'too much'
    return `Reported: there is ${amount} space around or inside A.`
  },
  'align': ({ params }) => {
    return `Align the ${edgeOf(params.edge)} of A with the ${edgeOf(params.edge)} of B. ${REFERENCE_STAYS}`
  },
  'group-align': ({ params, issue }) => `Align the ${edgeOf(params.edge)} of every group member`
    + ` with member ${anchorNumber(issue)}, the anchor, which stays as it is.`,
  'match-height': `Make the height of A match the height of B. ${REFERENCE_STAYS}`,
  'match-width': `Make the width of A match the width of B. ${REFERENCE_STAYS}`,
  'equal-gaps': ({ params }) => {
    const axis = params.axis ?? 'horizontal'
    return `Make the ${axis} gaps between the group members equal. No member is the reference.`
  },
  'clipped': 'Reported: text in A is clipped. Show it in full or truncate it deliberately;'
    + ' do not shrink the font only to make it fit.',
  'overlap': 'Reported: A overlaps B. Remove the overlap by changing A; B stays as it is.',
  'readability': ({ params }) => `Reported: A is hard to read (${words(params.observed)}).`,
  'inconsistent': 'Reported: A looks inconsistent with B. Make A follow B; B is the reference.',
  'feedback': ({ params }) => `Reported behaviour of A: ${words(params.observed)}.`
    + ' The note says what should happen.',
  'layout': ({ params }) => `Reported layout problem in A: ${words(params.observed)}.`,
  'note': 'See the note.',
  'touch-target': 'Reported: A is too small to tap or click reliably.'
    + ' Give it a hit area of at least 24 x 24 CSS pixels (44 x 44 on touch screens),'
    + ' keeping its look where possible.',
  'overflow': ({ params }) => {
    const how = described(OVERFLOW, params.observed)
    return `Reported: content of A overflows its box (${how}).`
      + ' Make it fit; hide or scroll it only if that is intended.'
  },
  'center': ({ params }) => `Reported: A is not centred ${centreAxis(params.axis)} in its container.`
    + ' Centre it with the container\'s layout, not with fixed offsets.',
  'text-wrong': ({ params }) => `Reported: the text of A is wrong (${described(TEXT, params.observed)}).`
    + ' The note gives the right text when it is known.',
  'text-wrap': ({ params }) => `Reported: text in A wraps badly (${words(params.observed)}).`,
  'wrong-color': ({ params }) => `Reported: the ${params.part ?? 'text'} colour of A is wrong.`
    + ' Use the theme\'s colour token instead of a literal value.',
  'icon': ({ params }) => `Reported: icon problem in A (${described(ICON, params.observed)}).`,
  'state-missing': ({ params }) => `Reported: A has no visible ${stateName(params.state)}.`
    + ' Add one that fits the existing component styles.',
  'keyboard': ({ params }) => `Reported keyboard problem in A: ${described(KEYBOARD, params.observed)}.`
    + ' Prefer native elements and document order over tabindex.',
  'a11y-name': ({ params }) => {
    if (params.observed !== 'wrong-name') {
      return 'Reported: A has no accessible name. Give it a label that says what it does.'
    }
    return 'Reported: the accessible name of A is wrong or unclear.'
      + ' Name it after what it does; the note may say how.'
  },
  'responsive': ({ params }) => `Reported: A breaks ${lookup(BREAKS, params.width) ?? 'on narrow screens'}.`
    + ' The capture viewport is in the evidence; check other widths after the fix.',
  'off-scale': ({ params }) => 'Reported: some spacing or size values of A are not on the'
    + ` ${gridScale(params)}px scale (flagged below).`
    + ' Use the project\'s spacing tokens rather than rounding by hand.',
  ...INTERFACE_SENTENCES,
}

/** Presets whose option the person left out: the issue says only what is known, the note the rest. */
const UNSPECIFIED: Record<string, string> = {
  'size': 'Reported: the size of A is wrong. Find what sets its size and correct it;'
    + ' the note says how, when there is one.',
  'spacing': 'Reported: the spacing around or inside A is wrong. The note says how, when there is one.',
  'equal-gaps': 'Make the gaps between the group members equal. No member is the reference.',
  'readability': 'Reported: A is hard to read.',
  'feedback': 'Reported: A does not behave as expected. The note says what should happen.',
  'layout': 'Reported: a layout problem in A.',
  'overflow': 'Reported: content of A overflows its box.'
    + ' Make it fit; hide or scroll it only if that is intended.',
  'center': 'Reported: A is not centred in its container.'
    + ' Centre it with the container\'s layout, not with fixed offsets.',
  'text-wrong': 'Reported: the text of A is wrong. The note gives the right text when it is known.',
  'text-wrap': 'Reported: text in A wraps badly.',
  'wrong-color': 'Reported: a colour of A is wrong.'
    + ' Use the theme\'s colour token instead of a literal value.',
  'icon': 'Reported: an icon problem in A.',
  'state-missing': 'Reported: A is missing a visible state, such as hover, focus or pressed.'
    + ' Add one that fits the existing component styles.',
  'keyboard': 'Reported: a keyboard problem in A. Prefer native elements and document order over tabindex.',
  'a11y-name': 'Reported: the accessible name of A is missing or wrong.'
    + ' Name it after what it does; the note may say how.',
  'responsive': 'Reported: A breaks at another screen size.'
    + ' The capture viewport is in the evidence; check other widths after the fix.',
  ...INTERFACE_UNSPECIFIED,
}

function consistency(issue: Issue, aspect: string): string {
  const what = lookup(ASPECT, aspect) ?? aspect
  if (issue.operands.b) {
    return `Make the ${what} of A consistent with B (differences below).`
      + ' B is the reference and stays as it is; prefer the token or component default B uses.'
  }
  return `Make the ${what} consistent across the group members (differences below).`
    + ' Prefer the value most members already share or the matching design token.'
}

/** A project preset's own sentence, with A, B and the person's choice put in. */
function projectSentence(summary: string, choice: string | undefined): string {
  return summary.replace(/\{a\}/g, 'A').replace(/\{b\}/g, 'B').replace(/\{choice\}/g, words(choice))
}

/**
 * A preset about one element, reported on several: the sentence names A, and A is the group, so the task
 * says the problem holds for each member. Group presets already speak of the members.
 */
function forEachMember(sentence: string, issue: Issue, def: PresetDef | undefined): string {
  const a = issue.operands.a
  const oneElement = def?.operands === 'single' || def?.operands === 'reference'
  // A gap is between the members, not in each of them.
  const betweenMembers = issue.intent.params.space === 'gap'
  if (a.kind !== 'group' || !oneElement || betweenMembers) return sentence
  return `${sentence} A is a group of ${a.members.length} elements: this holds for each of them.`
}

export function intentSentence(issue: Issue, registry: PresetRegistry): string {
  const def = registry.byId.get(issue.intent.preset.id)
  return forEachMember(presetSentence(issue, def), issue, def)
}

function presetSentence(issue: Issue, def: PresetDef | undefined): string {
  const { id, version } = issue.intent.preset
  const params = issue.intent.params
  if (id === 'spacing' && params.space) return spaceSentence(params.space, params.observed)
  if (def?.summary) return projectSentence(def.summary, def.choice ? params[def.choice.key] : '')
  const unspecified = lookup(UNSPECIFIED, id)
  if (def?.choice && !params[def.choice.key] && unspecified) return unspecified
  const sentence = lookup(SENTENCES, id)
  if (typeof sentence === 'string') return sentence
  if (sentence) return sentence({ params, issue })
  if (id.startsWith('consistent-')) return consistency(issue, id.slice('consistent-'.length))
  return `Preset ${id} version ${version} is not known to this exporter; use the note and evidence.`
}

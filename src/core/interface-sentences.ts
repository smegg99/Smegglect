// src/core/interface-sentences.ts
// The task sentences of the interface presets (interface-presets.ts), with and without the person's option.
// English and agent-neutral, as every other task sentence.

import { lookup } from './lookup'
import type { Issue } from './model'

/** What a sentence may read: the person's choices by key, and the issue for the one that needs more. */
export interface SentenceInput {
  params: Record<string, string>
  issue: Issue
}

export type Sentence = string | ((input: SentenceInput) => string)

const WHERE: Record<string, string> = {
  'to-left': 'on the left',
  'to-right': 'on the right',
  'to-top': 'at the top',
  'to-bottom': 'at the bottom',
}

const SHAPE: Record<string, string> = {
  square: 'Reported: A has the wrong shape: it should be square, as wide as it is tall.',
  round: 'Reported: A has the wrong shape: it should be round.',
  stretched: 'Reported: A is stretched out of its proportions. Keep its aspect ratio.',
}

const CONTROL: Record<string, string> = {
  'button-group': 'a button group (a segmented control)',
  'tabs': 'tabs',
  'switch': 'a switch',
  'menu': 'a dropdown menu',
  'icon-buttons': 'icon buttons named in their tooltips',
}

const VISIBILITY: Record<string, string> = {
  'should-hide': 'Reported: A is shown when it should be hidden.',
  'should-show': 'Reported: A is hidden when it should be shown.',
  'stays-behind': 'Reported: A stays on screen after the view it belongs to is left. Tie it to that view.',
}

const JUMPS: Record<string, string> = {
  'navigates': 'Reported: using A takes the app to another page or view when it should stay where it is.',
  'scrolls': 'Reported: using A scrolls the page when it should stay where it is.',
  'layout-shift': 'Reported: the layout jumps when A appears, changes or loads. Reserve the space it needs.',
}

const MOTION: Record<string, string> = {
  'no-transition': 'it changes without a transition',
  'too-slow': 'too slow',
  'too-fast': 'too fast',
  'janky': 'it stutters',
}

const MOTION_RULE = 'Animate transform and opacity where possible, and respect prefers-reduced-motion.'
const INTERFACE_UNSPECIFIED_VISIBILITY = 'Reported: A is shown or hidden at the wrong time.'
  + ' The note says when it should be visible.'
const INTERFACE_UNSPECIFIED_JUMPS = 'Reported: A moves the app or the page when it should stay where it is.'
  + ' The note says how.'

export const INTERFACE_SENTENCES: Record<string, Sentence> = {
  'edge-room': 'Reported: the content of A sits too close to its edges. Give A more inner padding from the'
    + ' spacing scale, the same on every side unless the note says otherwise.',
  'unnecessary-ellipsis': 'Reported: text in A ends in an ellipsis although there is room to show it in full.'
    + ' Find what limits it (a fixed or maximum width, nowrap, hidden overflow) and let it show in full;'
    + ' keep an ellipsis only where the space really runs out.',
  'scrollbar-covers': 'Reported: a scrollbar covers part of A. Keep the scrollbar\'s strip clear of content;'
    + ' overlay scrollbars, as in WebKitGTK and macOS, ignore scrollbar-gutter.',
  'placement': ({ params }) => 'Reported: A is in the wrong place; it belongs'
    + ` ${lookup(WHERE, params.where) ?? 'elsewhere'}. Move it within the layout rather than with offsets.`,
  'shape': ({ params }) => lookup(SHAPE, params.should) ?? 'Reported: A has the wrong shape.',
  'control': ({ params }) => 'Reported: A should be a different kind of control:'
    + ` ${lookup(CONTROL, params.control) ?? 'another one'}.`
    + ' Use the design system\'s component and keep what it does.',
  'design-system': 'Reported: A is not built with the project\'s design system. Rebuild it from the design'
    + ' system\'s components and tokens; the note may name them.',
  'like-app': 'Reported: A should look and behave like its counterpart in the app or screen the note names.'
    + ' Match it, sharing components where the projects share them.',
  'wrong-state': 'Reported: A shows the wrong state, such as checked when it is not or the wrong item marked'
    + ' active. Make it show the state it is in.',
  'visibility': ({ params }) => lookup(VISIBILITY, params.observed) ?? INTERFACE_UNSPECIFIED_VISIBILITY,
  'jumps': ({ params }) => lookup(JUMPS, params.observed) ?? INTERFACE_UNSPECIFIED_JUMPS,
  'motion': ({ params }) => {
    const how = lookup(MOTION, params.observed) ?? 'see the note'
    return `Reported: the motion of A is wrong (${how}). ${MOTION_RULE}`
  },
  'simplify': 'Reported: A is more complicated than it needs to be. Simplify it: fewer controls, options and'
    + ' words; the note may say what can go.',
  'remove': 'Reported: A should not be there. Remove it, with whatever exists only to support it.',
}

/** The same presets without the person's option: the issue says only what is known, the note the rest. */
export const INTERFACE_UNSPECIFIED: Record<string, string> = {
  placement: 'Reported: A is in the wrong place. The note says where it belongs; move it within the layout'
    + ' rather than with offsets.',
  shape: 'Reported: A has the wrong shape. The note says which shape it should have.',
  control: 'Reported: A should be a different kind of control. The note says which; use the design'
    + ' system\'s component for it.',
  visibility: INTERFACE_UNSPECIFIED_VISIBILITY,
  jumps: INTERFACE_UNSPECIFIED_JUMPS,
  motion: `Reported: the motion of A is wrong. ${MOTION_RULE}`,
}

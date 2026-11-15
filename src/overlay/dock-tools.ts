// src/overlay/dock-tools.ts
// The toolbar's keys as a table: one block per key, in groups between rules.

import type { Engine, EngineState } from '../dom/engine'
import type { Translate } from './i18n'
import type { Ui } from './runtime'

export interface Tool {
  id: string
  icon: string
  label: string
  caption: string
  kbd?: string
  pressed?: boolean
  expanded?: boolean
  popup?: 'menu'
  disabled?: boolean
  badge?: number
  act: () => void
}

/** What the keys read and do. */
export interface ToolInput {
  engine: Engine
  state: EngineState
  ui: Ui
  t: Translate
  /** The toolbar is the pop-out's ribbon rather than the page's button. */
  inWindow: boolean
  menuOpen: boolean
  putBack: () => void
  toggleIssues: () => void
  toggleSettings: () => void
  toggleMenu: () => void
}

/** The draft count, said after a label when there are drafts. */
function withDrafts(input: ToolInput, label: string): string {
  const count = input.state.drafts.issues.length
  if (!count) return label
  return `${label}, ${input.t('dock.drafts', { count })}`
}

/** In the pop-out the first key puts everything back on the page, where the button shows again. */
function backTools(input: ToolInput): Tool[] {
  if (!input.inWindow) return []
  return [{
    id: 'back',
    icon: 'putBack',
    label: input.t('popout.back'),
    caption: input.t('popout.backShort'),
    act: input.putBack,
  }]
}

/** What the pointer does on the page: pick, draw a region, or measure. */
function modeTools({ engine, state, t }: ToolInput): Tool[] {
  const mode = state.inspect.mode.kind
  return [
    {
      id: 'pick',
      icon: 'pick',
      label: t('dock.pick'),
      caption: t('dock.pickShort'),
      kbd: 'Alt+Shift+P',
      pressed: mode === 'pick',
      act: () => engine.togglePick(),
    },
    {
      id: 'region',
      icon: 'region',
      label: t('dock.region'),
      caption: t('dock.regionShort'),
      kbd: 'Alt+Shift+R',
      pressed: mode === 'region',
      act: () => engine.toggleRegion(),
    },
    // Measuring goes with picking, never with drawing a region: the engine turns the other off.
    {
      id: 'measure',
      icon: 'measure',
      label: t('dock.measure'),
      caption: t('dock.measureShort'),
      kbd: 'Alt+Shift+M',
      pressed: state.measuring,
      act: () => engine.setMeasuring(!state.measuring),
    },
  ]
}

function historyTools({ engine, state, t }: ToolInput): Tool[] {
  return [
    {
      id: 'undo',
      icon: 'undo',
      label: t('dock.undo'),
      caption: t('dock.undoShort'),
      kbd: 'Alt+Shift+Z',
      disabled: !state.drafts.undo.length,
      act: () => engine.undo(),
    },
    {
      id: 'redo',
      icon: 'redo',
      label: t('dock.redo'),
      caption: t('dock.redoShort'),
      kbd: 'Alt+Shift+Y',
      disabled: !state.drafts.redo.length,
      act: () => engine.redo(),
    },
  ]
}

/**
 * The issues: Show draws them on the page, Issues lists them in the drawer. The pop-out shows the drawer's
 * tabs all the time, so Issues is one of them there.
 */
function issueTools(input: ToolInput): Tool[] {
  const { engine, state, ui, t } = input
  const show: Tool = {
    id: 'annotations',
    icon: 'annotations',
    label: t('dock.annotations'),
    caption: t('dock.annotationsShort'),
    pressed: state.annotations,
    act: () => engine.setAnnotations(!state.annotations),
  }
  if (input.inWindow) return [show]
  const issues: Tool = {
    id: 'issues',
    icon: 'issues',
    label: withDrafts(input, t('dock.issues')),
    caption: t('dock.issues'),
    badge: state.drafts.issues.length,
    // Open while the drawer shows the issue list, or an issue opened from it.
    expanded: ui.inspector && (ui.view === 'issues' || (ui.view === 'issue' && ui.back === 'issues')),
    act: input.toggleIssues,
  }
  return [show, issues]
}

/** Settings opens the drawer at its view; More opens the menu. */
function panelTools(input: ToolInput): Tool[] {
  const { ui, t } = input
  const more: Tool = {
    id: 'more',
    icon: 'more',
    label: t('dock.more'),
    caption: t('dock.more'),
    expanded: input.menuOpen,
    popup: 'menu',
    act: input.toggleMenu,
  }
  const settings: Tool = {
    id: 'settings',
    icon: 'settings',
    label: t('settings.title'),
    caption: t('settings.title'),
    expanded: ui.inspector && ui.view === 'settings',
    act: input.toggleSettings,
  }
  return [settings, more]
}

/**
 * Groups between rules. Drawn last first when the tools sit before the button, so they still read Pick to
 * More.
 */
export function dockTools(input: ToolInput, reversed: boolean): Tool[][] {
  const back = backTools(input)
  const groups = [modeTools(input), historyTools(input), issueTools(input), panelTools(input)]
  const list = back.length ? [back, ...groups] : groups
  return reversed ? list.reverse().map(group => group.reverse()) : list
}

/** The button's label when folded: Open, with the draft count. */
export const openLabel = (input: ToolInput) => withDrafts(input, input.t('dock.open'))

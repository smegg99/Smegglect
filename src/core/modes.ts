// src/core/modes.ts
// Input mode and selection as one value, so impossible combinations cannot be represented.

import type { ContentsMode, Rect } from './model'
import { LIMITS } from './limits'

export interface Point {
  x: number
  y: number
}

/** The elements a region holds, found when it was drawn: the first of them and how many there were. */
export interface Held<H> {
  mode: ContentsMode
  handles: H[]
  total: number
}

/** H is the engine's opaque live-element handle; it never reaches persisted records. */
export type Selection<H> =
  | { kind: 'none' }
  | { kind: 'dom', handle: H }
  | { kind: 'group', handles: H[], anchor?: number }
  /** `page`: where it was drawn (see pageKey in src/dom/pins.ts); it is drawn only there. */
  | { kind: 'region', rect: Rect, page?: string, contents?: Held<H> }

/** Where to return after a reference or anchor choice finishes or is cancelled. */
export type Resume = 'pass' | 'pick'

export type Mode =
  | { kind: 'pass' }
  | { kind: 'pick' }
  | { kind: 'region', start?: Point }
  | { kind: 'reference', preset: string, params: Record<string, string>, resume: Resume }
  | { kind: 'anchor', preset: string, params: Record<string, string>, resume: Resume }

export interface InspectState<H> {
  mode: Mode
  selection: Selection<H>
}

export type InspectEvent<H> =
  | { type: 'toggle-pick' }
  | { type: 'toggle-region' }
  | { type: 'select', handle: H, extend?: boolean }
  | { type: 'select-group', handles: H[] }
  | { type: 'drop', index: number }
  | { type: 'drag-start', point: Point }
  | { type: 'drag-end', rect: Rect, page?: string, contents?: Held<H> }
  | { type: 'need-reference', preset: string, params: Record<string, string> }
  | { type: 'need-anchor', preset: string, params: Record<string, string> }
  | { type: 'chosen' }
  | { type: 'clear' }
  | { type: 'pass' }

export function initial<H>(): InspectState<H> {
  return { mode: { kind: 'pass' }, selection: { kind: 'none' } }
}

function regionOf<H>(rect: Rect, page?: string, contents?: Held<H>): Selection<H> {
  return {
    kind: 'region',
    rect,
    ...(page === undefined ? {} : { page }),
    ...(contents === undefined ? {} : { contents }),
  }
}

function resumeOf(mode: Mode): Resume {
  return mode.kind === 'pick' ? 'pick' : 'pass'
}

function extendSelection<H>(sel: Selection<H>, handle: H): Selection<H> {
  if (sel.kind === 'dom') {
    return sel.handle === handle ? { kind: 'none' } : { kind: 'group', handles: [sel.handle, handle] }
  }
  if (sel.kind === 'group') {
    const rest = sel.handles.filter(member => member !== handle)
    if (rest.length === sel.handles.length) {
      // A report lists at most this many members; one more is not taken in.
      return sel.handles.length < LIMITS.members ? { kind: 'group', handles: [...sel.handles, handle] } : sel
    }
    if (rest.length === 1) return { kind: 'dom', handle: rest[0] as H }
    return { kind: 'group', handles: rest }
  }
  return { kind: 'dom', handle }
}

export function reduce<H>(state: InspectState<H>, event: InspectEvent<H>): InspectState<H> {
  const { mode, selection } = state
  switch (event.type) {
    case 'toggle-pick':
      if (mode.kind === 'reference' || mode.kind === 'anchor') return state
      return { mode: mode.kind === 'pick' ? { kind: 'pass' } : { kind: 'pick' }, selection }
    case 'toggle-region':
      if (mode.kind === 'reference' || mode.kind === 'anchor') return state
      return { mode: mode.kind === 'region' ? { kind: 'pass' } : { kind: 'region' }, selection }
    // One pick ends the mode, as an inspect tool does; extending keeps it on while a group is built.
    case 'select':
      if (mode.kind !== 'pick') return state
      return event.extend
        ? { mode, selection: extendSelection(selection, event.handle) }
        : { mode: { kind: 'pass' }, selection: { kind: 'dom', handle: event.handle } }
    case 'select-group':
      if (mode.kind !== 'pick' || event.handles.length < 2) return state
      return {
        mode: { kind: 'pass' },
        selection: { kind: 'group', handles: event.handles.slice(0, LIMITS.members) },
      }
    // Takes one member out of a group, as picking it again while extending does.
    case 'drop': {
      if (selection.kind !== 'group' || mode.kind === 'reference' || mode.kind === 'anchor') return state
      const handle = selection.handles[event.index]
      return handle === undefined ? state : { mode, selection: extendSelection(selection, handle) }
    }
    case 'drag-start':
      if (mode.kind !== 'region') return state
      return { mode: { kind: 'region', start: event.point }, selection }
    case 'drag-end':
      if (mode.kind !== 'region' || !mode.start) return state
      return { mode: { kind: 'pass' }, selection: regionOf(event.rect, event.page, event.contents) }
    case 'need-reference':
      if (selection.kind === 'none' || selection.kind === 'region') return state
      if (mode.kind === 'reference' || mode.kind === 'anchor') return state
      return {
        mode: { kind: 'reference', preset: event.preset, params: event.params, resume: resumeOf(mode) },
        selection,
      }
    case 'need-anchor':
      if (selection.kind !== 'group') return state
      if (mode.kind === 'reference' || mode.kind === 'anchor') return state
      return {
        mode: { kind: 'anchor', preset: event.preset, params: event.params, resume: resumeOf(mode) },
        selection,
      }
    case 'chosen':
      if (mode.kind !== 'reference' && mode.kind !== 'anchor') return state
      return { mode: { kind: mode.resume }, selection }
    case 'clear':
      return { mode, selection: { kind: 'none' } }
    case 'pass':
      return { mode: { kind: 'pass' }, selection }
  }
}

/** Unwinds only the innermost owned operation. Null means Smegglect had nothing to cancel. */
export function escape<H>(state: InspectState<H>): InspectState<H> | null {
  const { mode, selection } = state
  if (mode.kind === 'reference' || mode.kind === 'anchor') return { mode: { kind: mode.resume }, selection }
  if (mode.kind === 'region' && mode.start) return { mode: { kind: 'region' }, selection }
  if (mode.kind === 'pick' || mode.kind === 'region') return { mode: { kind: 'pass' }, selection }
  if (selection.kind !== 'none') return { mode, selection: { kind: 'none' } }
  return null
}

/** True while pointer input belongs to Smegglect rather than the host. */
export function ownsPointer(mode: Mode): boolean {
  return mode.kind !== 'pass'
}

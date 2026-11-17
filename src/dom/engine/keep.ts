// src/dom/engine/keep.ts
// The selection described the way an issue target is, so it can be found again: after the page reloads, or
// when the page replaces the selected elements, as a hot update after an edit re-renders them.

import { shift } from '../../core/geometry'
import type { ContentsMode, TargetRef } from '../../core/model'
import type { Selection } from '../../core/modes'
import { anchoredRect } from '../anchor'
import { rendered } from '../capture'
import { regionContents } from '../contents'
import { refOf, type Operand } from '../issue'
import { resolveAgain } from '../resolve'
import type { EngineBase } from './context'

/** A selection as plain data: its target, and for a region the page it was drawn on and what it lists. */
export interface KeptSelection {
  target: TargetRef
  page?: string
  mode?: ContentsMode
}

/** The selection as the operand A of an issue. */
export function operandOf(selection: Selection<Element>): Operand | null {
  if (selection.kind === 'dom') return { kind: 'dom', element: selection.handle }
  if (selection.kind === 'group') {
    return { kind: 'group', elements: selection.handles, anchor: selection.anchor }
  }
  if (selection.kind === 'region') {
    const { rect, contents, anchor } = selection
    const held = contents ? { contents } : {}
    return { kind: 'region', rect, frame: 'document', ...held, ...(anchor ? { anchor } : {}) }
  }
  return null
}

/** The elements the selection stands on now: its own, or a region's anchor. */
export function handlesOf(selection: Selection<Element>): Element[] {
  if (selection.kind === 'dom') return [selection.handle]
  if (selection.kind === 'group') return selection.handles
  if (selection.kind === 'region' && selection.anchor) return [selection.anchor.handle]
  return []
}

export function keptOf(context: EngineBase): KeptSelection | null {
  const { selection } = context.store.get().inspect
  const operand = operandOf(selection)
  if (!operand || handlesOf(selection).some(handle => !handle.isConnected)) return null
  const target = refOf(operand, context.attributes)
  if (selection.kind !== 'region') return { target }
  const page = selection.page === undefined ? {} : { page: selection.page }
  return { target, ...page, ...(selection.contents ? { mode: selection.contents.mode } : {}) }
}

/** One element found again by its description; null when it is gone or more than one fits. */
function found(context: EngineBase, descriptor: Parameters<typeof resolveAgain>[1]): Element | null {
  const resolved = resolveAgain(context.doc, descriptor, context.attributes)
  return resolved.status === 'resolved' ? resolved.element : null
}

function regionAgain(context: EngineBase, kept: KeptSelection): Selection<Element> | null {
  const { target } = kept
  if (target.kind !== 'region') return null
  const { win, doc } = context
  const element = target.anchor ? found(context, target.anchor.element) : null
  const anchor = element && target.anchor ? { handle: element, offset: target.anchor.offset } : undefined
  // Where it is drawn now, from which its elements are listed again.
  const viewport = anchor && rendered(anchor.handle)
    ? anchoredRect(anchor, target.rect)
    : shift(target.rect, -win.scrollX, -win.scrollY)
  const listed = kept.mode ? regionContents(doc, viewport, kept.mode) : null
  const contents = listed && kept.mode
    ? { mode: kept.mode, handles: listed.elements, total: listed.total }
    : undefined
  return {
    kind: 'region',
    rect: shift(viewport, win.scrollX, win.scrollY),
    ...(kept.page === undefined ? {} : { page: kept.page }),
    ...(contents ? { contents } : {}),
    ...(anchor ? { anchor } : {}),
  }
}

/** The kept selection with its elements found again on the page; null when one of them is not found. */
export function selectionAgain(context: EngineBase, kept: KeptSelection): Selection<Element> | null {
  const { target } = kept
  if (target.kind === 'dom') {
    const handle = found(context, target.element)
    return handle ? { kind: 'dom', handle } : null
  }
  if (target.kind === 'group') {
    const handles = target.members.map(member => found(context, member))
    if (handles.some(handle => !handle)) return null
    const anchor = target.anchor === undefined ? {} : { anchor: target.anchor }
    return { kind: 'group', handles: handles as Element[], ...anchor }
  }
  return regionAgain(context, kept)
}

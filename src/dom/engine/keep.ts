// src/dom/engine/keep.ts
// The selection described the way an issue target is, so it can be found again: after the page reloads, or
// when the page replaces the selected elements, as a hot update after an edit re-renders them.

import type { TargetRef } from '../../core/model'
import type { Selection } from '../../core/modes'
import { refOf, type Operand } from '../issue'
import { resolveAgain } from '../resolve'
import type { EngineBase } from './context'

/** A selection as plain data: its target. */
export interface KeptSelection {
  target: TargetRef
}

/** The selection as the operand A of an issue. */
export function operandOf(selection: Selection<Element>): Operand | null {
  if (selection.kind === 'dom') return { kind: 'dom', element: selection.handle }
  if (selection.kind === 'group') {
    return { kind: 'group', elements: selection.handles, anchor: selection.anchor }
  }
  return null
}

/** The elements the selection stands on now. */
export function handlesOf(selection: Selection<Element>): Element[] {
  if (selection.kind === 'dom') return [selection.handle]
  if (selection.kind === 'group') return selection.handles
  return []
}

export function keptOf(context: EngineBase): KeptSelection | null {
  const { selection } = context.store.get().inspect
  const operand = operandOf(selection)
  if (!operand || handlesOf(selection).some(handle => !handle.isConnected)) return null
  return { target: refOf(operand, context.attributes) }
}

/** One element found again by its description; null when it is gone or more than one fits. */
function found(context: EngineBase, descriptor: Parameters<typeof resolveAgain>[1]): Element | null {
  const resolved = resolveAgain(context.doc, descriptor, context.attributes)
  return resolved.status === 'resolved' ? resolved.element : null
}

/** The kept selection with its elements found again on the page; null when one of them is not found. */
export function selectionAgain(context: EngineBase, kept: KeptSelection): Selection<Element> | null {
  const { target } = kept
  if (target.kind === 'dom') {
    const handle = found(context, target.element)
    return handle ? { kind: 'dom', handle } : null
  }
  const handles = target.members.map(member => found(context, member))
  if (handles.some(handle => !handle)) return null
  const anchor = target.anchor === undefined ? {} : { anchor: target.anchor }
  return { kind: 'group', handles: handles as Element[], ...anchor }
}

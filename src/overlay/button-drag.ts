// src/overlay/button-drag.ts
// Dragging the button along the page's edges: a press that travels is a drag, one that does not a click.

import { ref, type Ref } from 'vue'
import { DRAG_SLOP, nearestSpot, type Spot } from './button'
import type { Settings } from './context'
import type { Ui } from './runtime'

/** One press on the button, from its pointer's start. */
interface Press {
  id: number
  x: number
  y: number
  moved: boolean
}

export interface ButtonDrag {
  /** Where the button is while it is dragged, before the drop is remembered. */
  dragSpot: Ref<Spot | null>
  /** Pointerdown on the button. */
  grab: (event: PointerEvent) => void
  /** The click that ends a drag is not a press on the button. */
  swallowed: () => boolean
}

/** `started` runs when a press starts to travel, so open menus and tips can close. */
export function useButtonDrag(settings: Settings, ui: Ui, started: () => void): ButtonDrag {
  const dragSpot = ref<Spot | null>(null)
  let press: Press | null = null
  let swallow = false

  function move(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return
    const travel = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    if (!press.moved && travel < DRAG_SLOP) return
    press.moved = true
    started()
    dragSpot.value = nearestSpot({ x: event.clientX, y: event.clientY }, ui.viewport)
  }

  function drop(event: PointerEvent) {
    const key = event.currentTarget as HTMLElement
    key.removeEventListener('pointermove', move)
    key.removeEventListener('pointerup', drop)
    key.removeEventListener('pointercancel', drop)
    if (press?.moved) {
      if (event.type === 'pointerup' && dragSpot.value) {
        settings.placement = dragSpot.value.placement
        settings.offset = dragSpot.value.offset
      }
      // The click that ends a drag arrives in this same task; it is not a press on the button.
      swallow = true
      key.ownerDocument.defaultView?.setTimeout(() => (swallow = false))
    }
    press = null
    dragSpot.value = null
  }

  function grab(event: PointerEvent) {
    if (event.button !== 0) return
    const key = event.currentTarget as HTMLElement
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    key.setPointerCapture?.(event.pointerId)
    key.addEventListener('pointermove', move)
    key.addEventListener('pointerup', drop)
    key.addEventListener('pointercancel', drop)
  }

  return { dragSpot, grab, swallowed: () => swallow }
}

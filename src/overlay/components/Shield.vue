<!-- src/overlay/components/Shield.vue -->
<template>
  <div
    class="shield"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="cancel"
  />
</template>

<script setup lang="ts">
import { normalise } from '../../core/geometry'
import type { ContentsMode } from '../../core/contents'
import { useRuntime } from '../runtime'

// Region drawing owns the whole viewport only while region mode is on, including over frames and canvases.
const { engine, ui } = useRuntime()
let start: { x: number, y: number } | null = null

function down(event: PointerEvent) {
  if (event.button !== 0) return
  start = { x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  engine.regionStart(start)
}

/** As in CAD: dragged to the right lists the elements fully inside, to the left the ones it touches. */
function modeOf(from: { x: number }, event: PointerEvent): ContentsMode {
  return event.clientX < from.x ? 'touching' : 'inside'
}

function move(event: PointerEvent) {
  if (!start) return
  ui.regionMode = modeOf(start, event)
  engine.regionDraft(normalise(start.x, start.y, event.clientX, event.clientY))
}

function up(event: PointerEvent) {
  if (!start) return
  const rect = normalise(start.x, start.y, event.clientX, event.clientY)
  const mode = modeOf(start, event)
  start = null
  ui.regionMode = null
  engine.regionEnd(rect, mode)
}

function cancel() {
  start = null
  ui.regionMode = null
  engine.escape()
}
</script>

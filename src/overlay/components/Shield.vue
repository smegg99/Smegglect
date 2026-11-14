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
import { useRuntime } from '../runtime'

// Region drawing owns the whole viewport only while region mode is on, including over frames and canvases.
const { engine } = useRuntime()
let start: { x: number, y: number } | null = null

function down(event: PointerEvent) {
  if (event.button !== 0) return
  start = { x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  engine.regionStart(start)
}

function move(event: PointerEvent) {
  if (!start) return
  engine.regionDraft(normalise(start.x, start.y, event.clientX, event.clientY))
}

function up(event: PointerEvent) {
  if (!start) return
  const rect = normalise(start.x, start.y, event.clientX, event.clientY)
  start = null
  engine.regionEnd(rect)
}

function cancel() {
  start = null
  engine.escape()
}
</script>

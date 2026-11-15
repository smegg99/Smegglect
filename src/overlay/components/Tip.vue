<!-- src/overlay/components/Tip.vue -->
<template>
  <div
    v-if="ui.tip && ui.tip.doc === surface.doc"
    ref="el"
    class="tip"
    role="tooltip"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
  >
    {{ ui.tip.text }}<kbd v-if="ui.tip.kbd">{{ ui.tip.kbd }}</kbd>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { place, type Side } from '../place'
import { useRuntime, useSurface } from '../runtime'

const { ui } = useRuntime()
/** A tip shows in the window of the element that raised it. */
const surface = useSurface()
const el = ref<HTMLElement | null>(null)
const pos = ref({ x: -9999, y: -9999 })

const ORDER: Record<string, Side[]> = {
  above: ['above', 'below', 'right', 'left'],
  below: ['below', 'above', 'right', 'left'],
  left: ['left', 'right', 'above', 'below'],
  right: ['right', 'left', 'above', 'below'],
}

watch(() => ui.tip, async (tip) => {
  pos.value = { x: -9999, y: -9999 }
  if (!tip || tip.doc !== surface.doc) return
  await nextTick()
  if (!el.value || ui.tip !== tip) return
  const { width, height } = el.value.getBoundingClientRect()
  const size = { width, height }
  const rect = tip.rect
  // Centre on the key along the side's axis before clamping.
  const anchor = tip.side === 'above' || tip.side === 'below'
    ? { x: rect.x + rect.width / 2 - size.width / 2, y: rect.y, width: size.width, height: rect.height }
    : { x: rect.x, y: rect.y + rect.height / 2 - size.height / 2, width: rect.width, height: size.height }
  const box = place(anchor, size, surface.viewport, ORDER[tip.side], 6)
  pos.value = { x: box.x, y: box.y }
})
</script>

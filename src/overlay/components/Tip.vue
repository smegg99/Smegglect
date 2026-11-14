<!-- src/overlay/components/Tip.vue -->
<template>
  <div
    v-if="ui.tip"
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
import { useRuntime } from '../runtime'

const { ui } = useRuntime()
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
  if (!tip) return
  await nextTick()
  if (!el.value || ui.tip !== tip) return
  const { width, height } = el.value.getBoundingClientRect()
  const size = { width, height }
  const r = tip.rect
  // Centre on the key along the side's axis before clamping.
  const anchor = tip.side === 'above' || tip.side === 'below'
    ? { x: r.x + r.width / 2 - size.width / 2, y: r.y, width: size.width, height: r.height }
    : { x: r.x, y: r.y + r.height / 2 - size.height / 2, width: r.width, height: size.height }
  const box = place(anchor, size, ui.viewport, ORDER[tip.side], [], 6)
  pos.value = { x: box.x, y: box.y }
})
</script>

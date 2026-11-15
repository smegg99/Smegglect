<!-- src/overlay/components/FrameShield.vue -->
<template>
  <div
    v-if="rect"
    class="shield frame"
    data-shield
    :style="{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` }"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRuntime } from '../runtime'

// A frame's content receives its own pointer events; this cover takes the click so picking selects the frame.
const { geo } = useRuntime()
const rect = computed(() => {
  const candidate = geo.value.candidate
  return candidate && candidate.boundary === 'iframe' ? candidate.rect : null
})
</script>

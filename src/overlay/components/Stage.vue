<!-- src/overlay/components/Stage.vue -->
<!-- The toolbar, the panel, the toast and tooltips: on the page, or moved live into the pop-out window. -->
<template>
  <Teleport
    :to="target"
    :disabled="!target"
  >
    <div
      v-bind="$attrs"
      :class="{ 'in-window': !!target }"
    >
      <slot />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, provide } from 'vue'
import { SURFACE, useRuntime, type Surface } from '../runtime'

defineOptions({ inheritAttrs: false })

const { doc, ui, popout } = useRuntime()
const target = computed(() => popout.value?.mount ?? null)

// Read on every use, so the same components follow the move without being made again.
provide<Surface>(SURFACE, {
  get doc() {
    return popout.value?.doc ?? doc
  },
  get viewport() {
    return popout.value?.viewport ?? ui.viewport
  },
  get window() {
    return !!popout.value
  },
})
</script>

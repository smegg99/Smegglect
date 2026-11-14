<!-- src/overlay/components/Launcher.vue -->
<template>
  <div
    class="float launcher"
    :style="style"
  >
    <Key
      icon="mark"
      :label="label"
      kbd="Alt+Shift+S"
      :badge="count"
      :tip-side="side"
      @click="open"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRuntime } from '../runtime'
import Key from './Key.vue'

const { engine, state, settings, ui, t } = useRuntime()

function open() {
  ui.focusDock = true
  engine.setExpanded(true)
}
const count = computed(() => state.value.drafts.issues.length)
const label = computed(() => count.value
  ? `${t('dock.open')}, ${t('dock.drafts', { count: count.value })}`
  : t('dock.open'))

const side = computed(() => settings.placement === 'top' ? 'below' : settings.placement === 'left' ? 'right' : settings.placement === 'right' ? 'left' : 'above')

const style = computed(() => {
  const edge = '12px'
  if (settings.placement === 'top') return { top: edge, right: edge }
  if (settings.placement === 'left') return { left: edge, bottom: edge }
  return { right: edge, bottom: edge }
})
</script>

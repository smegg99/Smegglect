<!-- src/overlay/components/ToolGroup.vue -->
<!-- S99AB's segmented control (UiToolGroup, UiToolKey): keys that share their borders, one choice always set.
     Restated here, since S99AB's scoped component styles cannot reach the overlay's shadow root. -->
<template>
  <div
    class="tool-group"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      class="tool-key"
      :class="{ active: item.value === modelValue, 'icon-only': !!item.icon }"
      :aria-pressed="item.value === modelValue"
      :aria-label="item.icon ? item.label : undefined"
      :title="item.icon ? item.label : undefined"
      :disabled="disabled"
      @click="emit('update:modelValue', item.value)"
    >
      <VIcon
        v-if="item.icon"
        :icon="item.icon"
        size="16"
      />
      <span v-else>{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { VIcon } from 'vuetify/components/VIcon'

/** One choice: an icon key names itself in its tooltip and to assistive technology. */
export interface ToolItem {
  value: string
  label: string
  icon?: string
}

defineProps<{
  items: readonly ToolItem[]
  modelValue: string
  /** The group's accessible name. */
  label: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

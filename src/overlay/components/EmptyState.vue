<!-- src/overlay/components/EmptyState.vue -->
<template>
  <div class="empty">
    <Icon :name="icon" />
    <h3>{{ title }}</h3>
    <p>{{ text }}</p>
    <div
      v-if="$slots.default"
      class="list"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{ icon: string, title: string, text: string }>()
</script>

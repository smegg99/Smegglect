<!-- fixtures/vite-vue/src/components/TaskRow.vue -->
<template>
  <li class="task">
    <span>{{ title }}</span>
    <DoneButton @click="emit('done')" />
  </li>
</template>

<script setup lang="ts">
import DoneButton from './DoneButton.vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ done: [] }>()
</script>

<style>
.task { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
</style>

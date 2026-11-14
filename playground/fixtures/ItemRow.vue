<!-- playground/fixtures/ItemRow.vue -->
<template>
  <li class="item-row">
    <span class="name">{{ name }}</span>
    <span class="qty">x{{ qty }}</span>
    <button class="remove" type="button" @click="emit('remove')">Remove</button>
  </li>
</template>

<script setup lang="ts">
defineProps<{ name: string, qty: number }>()
const emit = defineEmits<{ remove: [] }>()
</script>

<style>
.item-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid #eee; }
.item-row .name { flex: 1; }
.item-row .qty { color: #666; }
</style>

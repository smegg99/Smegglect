<!-- src/overlay/components/Icon.vue -->
<template>
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  ><path :d="iconOf(name)" /></svg>
</template>

<script setup lang="ts">
import { iconOf } from '../icons'

defineProps<{ name: string }>()
</script>

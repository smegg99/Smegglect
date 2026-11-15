<!-- src/overlay/components/Logo.vue -->
<!-- The Smegglect logo from assets/, drawn path for path; its white parts follow the text colour. -->
<template>
  <svg
    class="logo"
    :viewBox="art.viewBox"
    role="img"
    :aria-label="label"
    focusable="false"
  >
    <path
      v-for="(path, index) in art.paths"
      :key="index"
      :d="path.d"
      :fill="path.fill"
      :transform="path.transform || undefined"
      :fill-rule="path.evenodd ? 'evenodd' : undefined"
    />
  </svg>
</template>

<script setup lang="ts">
import { smegglectLogo } from '../logos'

defineProps<{ label: string }>()
const art = smegglectLogo()
</script>

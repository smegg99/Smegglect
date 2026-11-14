<!-- src/overlay/components/Comparison.vue -->
<template>
  <table class="cmp">
    <thead>
      <tr>
        <th scope="col">
          {{ t('issue.property') }}
        </th>
        <th
          v-for="c in data.columns"
          :key="c"
          scope="col"
        >
          {{ c }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="r in data.rows"
        :key="r.property"
        :data-flagged="r.flagged || undefined"
      >
        <th scope="row">
          {{ r.property }}<span
            v-if="r.flagged"
            class="sr"
          > ({{ t('issue.flagged') }})</span>
        </th>
        <td
          v-for="(v, i) in r.values"
          :key="i"
        >
          {{ v || '-' }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import type { Comparison } from '../../core/compare'
import { useRuntime } from '../runtime'

defineProps<{ data: Comparison }>()
const { t } = useRuntime()
</script>

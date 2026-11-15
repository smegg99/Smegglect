<!-- src/overlay/components/Readout.vue -->
<template>
  <Tree
    v-if="nodes.length"
    class="readout"
    name="measure"
    :label="t('inspector.measurements')"
    :nodes="nodes"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { px } from '../../core/geometry'
import { family, hex, shorthand } from '../readout'
import { useRuntime } from '../runtime'
import Tree, { type TreeNode } from './Tree.vue'

const { geo, t } = useRuntime()

const row = (id: string, meta: string, swatch?: string): TreeNode => ({
  id: `measure:${id}`,
  label: t(`inspector.readout.${id}`),
  meta,
  quiet: true,
  ...(swatch ? { swatch } : {}),
})

/** One folded branch: a row per value, the value at the end. A group's sizes are in its member list. */
const nodes = computed<TreeNode[]>(() => {
  const readout = geo.value.readout
  let children: TreeNode[] = []
  if (readout) {
    const size = Number.parseFloat(readout.font.size)
    const line = Number.parseFloat(readout.font.lineHeight)
    const fontSize = Number.isFinite(size) ? `${px(size)}px` : readout.font.size
    children = [
      row('size', `${px(readout.width)} x ${px(readout.height)}`),
      row('padding', shorthand(readout.box.padding)),
      row('margin', shorthand(readout.box.margin)),
      row('border', shorthand(readout.box.border)),
      row('font', `${fontSize} ${readout.font.weight}`),
      row('family', family(readout.font.family)),
      row('lineHeight', Number.isFinite(line) ? `${px(line)}px` : readout.font.lineHeight),
      row('color', hex(readout.color), readout.color),
      row('background', hex(readout.background), readout.background),
    ]
  }
  if (!children.length) return []
  return [{ id: 'measurements', label: t('inspector.measurements'), open: false, children }]
})
</script>

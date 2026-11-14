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
  const r = geo.value.readout
  let children: TreeNode[] = []
  if (r) {
    const size = Number.parseFloat(r.font.size)
    const line = Number.parseFloat(r.font.lineHeight)
    children = [
      row('size', `${px(r.width)} x ${px(r.height)}`),
      row('padding', shorthand(r.box.padding)),
      row('margin', shorthand(r.box.margin)),
      row('border', shorthand(r.box.border)),
      row('font', `${Number.isFinite(size) ? `${px(size)}px` : r.font.size} ${r.font.weight}`),
      row('family', family(r.font.family)),
      row('lineHeight', Number.isFinite(line) ? `${px(line)}px` : r.font.lineHeight),
      row('color', hex(r.color), r.color),
      row('background', hex(r.background), r.background),
    ]
  }
  if (!children.length) return []
  return [{ id: 'measurements', label: t('inspector.measurements'), open: false, children }]
})
</script>

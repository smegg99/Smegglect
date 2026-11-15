<!-- src/overlay/components/Actions.vue -->
<template>
  <div class="actions-list">
    <Tree
      name="actions"
      :label="t('inspector.actions')"
      :nodes="nodes"
      @activate="run"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { actionGroups, type GroupId, type TargetKind, type Tile } from '../actions'
import { choiceLabel, presetLabel } from '../labels'
import { useRuntime } from '../runtime'
import Tree, { type TreeNode } from './Tree.vue'

const props = defineProps<{
  kind: TargetKind,
  selected: { preset: string, params: Record<string, string> },
}>()
const emit = defineEmits<{ choose: [preset: string, params: Record<string, string>] }>()
const { engine, settings, t } = useRuntime()
const registry = engine.registry

/** Under "Differs from another" the comparison is implied, so each row names only what differs. */
const SHORT: Record<string, string> = {
  'consistent-padding': 'padding',
  'consistent-margin': 'margin',
  'consistent-gap': 'gap',
  'consistent-size': 'size',
  'consistent-radius': 'radius',
  'consistent-type': 'type',
  'consistent-color': 'color',
  'inconsistent': 'other',
}

/** The common groups start open; the longer, rarer ones start folded. */
const FOLDED = new Set<GroupId>(['look', 'access', 'differs'])

function label(id: string, group: GroupId, params: Record<string, string>): string {
  const def = registry.byId.get(id)
  if (group === 'differs' && SHORT[id]) return t(`inspector.consistency.${SHORT[id]}`)
  const name = presetLabel(def, id, t)
  const option = def?.choice ? params[def.choice.key] : undefined
  return option ? `${name}: ${choiceLabel(def, option, t)}` : name
}

const tiles = new Map<string, Tile>()

const nodes = computed<TreeNode[]>(() => {
  tiles.clear()
  return actionGroups(registry, props.kind, settings.favourites, label).map(group => ({
    id: `group:${group.id}`,
    label: t(`inspector.group.${group.id}`),
    open: !FOLDED.has(group.id),
    children: group.tiles.map((tile): TreeNode => {
      const id = `${group.id}:${tile.preset}:${JSON.stringify(tile.params)}`
      tiles.set(id, tile)
      const attrs: Record<string, string> = group.id === 'favourites'
        ? { 'data-favourite': tile.preset }
        : { 'data-preset': tile.preset }
      const on = tile.preset === props.selected.preset
        && JSON.stringify(tile.params) === JSON.stringify(props.selected.params)
      return {
        id,
        ...(on ? { selected: true } : {}),
        label: tile.label,
        icon: tile.icon,
        ...(tile.needsB ? { tip: t('inspector.needsBTip'), sr: t('inspector.needsB') } : {}),
        attrs,
      }
    }),
  }))
})

/** Chooses the type for the issue being written below the tree. */
function run(node: TreeNode) {
  const tile = tiles.get(node.id)
  if (tile) emit('choose', tile.preset, tile.params)
}
</script>

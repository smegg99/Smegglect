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

const props = defineProps<{ kind: TargetKind }>()
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
  return actionGroups(registry, props.kind, settings.favourites, label).map(g => ({
    id: `group:${g.id}`,
    label: t(`inspector.group.${g.id}`),
    open: !FOLDED.has(g.id),
    children: g.tiles.map((tile): TreeNode => {
      const id = `${g.id}:${tile.preset}:${JSON.stringify(tile.params)}`
      tiles.set(id, tile)
      const attrs: Record<string, string> = g.id === 'favourites' ? { 'data-favourite': tile.preset } : { 'data-preset': tile.preset }
      return {
        id,
        label: tile.label,
        icon: tile.icon,
        ...(tile.needsB ? { tip: t('inspector.needsBTip'), sr: t('inspector.needsB') } : {}),
        attrs,
      }
    }),
  }))
})

/** Starts a preset; the issue form (or the B and anchor steps first) takes it from here. */
function run(node: TreeNode) {
  const tile = tiles.get(node.id)
  if (tile) engine.begin(tile.preset, tile.params)
}
</script>

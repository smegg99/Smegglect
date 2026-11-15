<!-- src/overlay/components/Tree.vue -->
<template>
  <div
    ref="root"
    class="tree"
    role="tree"
    :aria-label="label"
    :data-tree="name"
    @keydown="onKey"
  >
    <div
      v-for="row in rows"
      :key="row.node.id"
      v-bind="row.node.attrs ?? {}"
      class="tree-row"
      :class="{
        branch: row.branch,
        open: row.open,
        quiet: row.node.quiet,
        warn: row.node.warn,
        on: row.node.selected
      }"
      role="treeitem"
      :aria-level="row.depth + 1"
      :aria-expanded="row.branch ? row.open : undefined"
      :aria-keyshortcuts="row.node.remove ? 'Delete' : undefined"
      :aria-selected="row.node.selected ? 'true' : undefined"
      :tabindex="row.node.id === tabbable ? 0 : -1"
      :data-node="row.node.id"
      :style="{ '--depth': row.depth }"
      @click="press(row)"
      @focus="focusId = row.node.id"
      @pointerenter="enter(row, $event)"
      @pointerleave="leave(row)"
    >
      <span
        v-if="row.depth > 0"
        class="tree-guide"
        :class="{ end: row.last }"
        :style="{ '--guide': row.depth - 1 }"
      />
      <span
        class="tree-twist"
        :class="{ none: !row.branch }"
      ><Icon name="chevronRight" /></span>
      <span
        v-if="row.node.badge"
        class="num"
      >{{ row.node.badge }}</span>
      <Icon
        v-if="row.node.icon"
        :name="row.node.icon"
      />
      <span class="tree-name">{{ row.node.label }}</span>
      <span
        v-if="row.node.meta || row.node.swatch"
        class="tree-meta"
      ><span
        v-if="row.node.swatch"
        class="swatch"
        :style="{ background: row.node.swatch }"
      /><span class="tree-value">{{ row.node.meta }}</span></span>
      <span
        v-if="row.node.state"
        class="tree-state"
        :class="{ warn: row.node.state.warn }"
      ><Icon :name="row.node.state.icon" />{{ row.node.state.text }}</span>
      <Key
        v-for="action in row.node.actions ?? []"
        :key="action.id"
        class="tree-act"
        :icon="action.icon"
        :label="action.label"
        :data-act="action.id"
        :tabindex="row.node.id === tabbable ? 0 : -1"
        @click.stop="emit('act', row.node, action.id)"
      />
      <Key
        v-if="row.node.remove"
        class="tree-remove"
        icon="close"
        :label="row.node.remove"
        kbd="Delete"
        tabindex="-1"
        @click.stop="remove(row)"
      />
      <span
        v-if="row.node.tip && row.node.sr"
        class="sr"
      >, {{ row.node.sr }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRuntime } from '../runtime'
import { hideTip, showTip } from '../tip'
import Icon from './Icon.vue'
import Key from './Key.vue'

/** One row of a tree: a branch when it has children, a leaf otherwise. */
export interface TreeNode {
  id: string
  label: string
  icon?: string
  /** A small number before the label, e.g. an issue's. */
  badge?: string
  /** A short value at the row's end. */
  meta?: string
  /** A colour sample before the value. */
  swatch?: string
  /** Where something stands, e.g. a sent issue with the agent: an icon and words at the row's end. */
  state?: { icon: string, text: string, warn?: boolean }
  /** Shown on hover and focus; `sr` repeats it for screen readers. */
  tip?: string
  sr?: string
  /** Label of an X key at the row's end, also reached with Delete; pressing it emits `remove`. */
  remove?: string
  /** Small keys at the row's end, e.g. a report's copy and save; pressing one emits `act` with its id. */
  actions?: { id: string, icon: string, label: string }[]
  warn?: boolean
  /** The row picked in a tree used as a choice, e.g. the issue type. */
  selected?: boolean
  /** Read-only: hover and press do nothing. */
  quiet?: boolean
  /** Extra attributes for the row element. */
  attrs?: Record<string, string>
  children?: TreeNode[]
  /** Whether the branch starts open; what the person chooses later is remembered. */
  open?: boolean
}

interface Row {
  node: TreeNode
  depth: number
  branch: boolean
  open: boolean
  last: boolean
  parent: string | null
}

const props = defineProps<{ nodes: TreeNode[], label: string, name: string }>()
const emit = defineEmits<{
  activate: [node: TreeNode],
  remove: [node: TreeNode],
  act: [node: TreeNode, action: string],
  hover: [node: TreeNode | null],
}>()
const { ui } = useRuntime()
const root = ref<HTMLElement | null>(null)

const key = (id: string) => `${props.name}:${id}`
const isOpen = (node: TreeNode) => ui.folds[key(node.id)] ?? node.open ?? true

/** Visible rows in order: children only under open branches. */
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (list: TreeNode[], depth: number, parent: string | null) => {
    list.forEach((node, i) => {
      const children = node.children ?? []
      const branch = children.length > 0
      const open = branch && isOpen(node)
      out.push({ node, depth, branch, open, last: i === list.length - 1, parent })
      if (open) walk(children, depth + 1, node.id)
    })
  }
  walk(props.nodes, 0, null)
  return out
})

const focusId = ref<string | null>(null)
// One row is reachable by Tab: the last focused one, else the first.
const tabbable = computed(() => rows.value.find(row => row.node.id === focusId.value)?.node.id
  ?? rows.value[0]?.node.id
  ?? null)

function toggle(row: Row, open = !row.open) {
  ui.folds[key(row.node.id)] = open
}

function press(row: Row) {
  focusId.value = row.node.id
  if (row.branch) toggle(row)
  else if (!row.node.quiet) emit('activate', row.node)
}

/** Focus stays in the list: on the row that takes the removed one's place, else the one before. */
async function remove(row: Row) {
  const at = rows.value.indexOf(row)
  emit('remove', row.node)
  await nextTick()
  const list = rows.value
  focusRow(list[Math.min(at, list.length - 1)]?.node.id)
}

function enter(row: Row, event: PointerEvent) {
  if (row.node.tip) showTip(
    ui,
    event.currentTarget as Element,
    row.node.tip,
    ui.panel?.edge === 'left' ? 'right' : 'left',
  )
  if (!row.branch) emit('hover', row.node)
}

function leave(row: Row) {
  if (row.node.tip) hideTip(ui, row.node.tip)
  if (!row.branch) emit('hover', null)
}

function focusRow(id: string | undefined) {
  if (!id) return
  focusId.value = id
  root.value?.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)?.focus()
}

/** Arrow keys walk the visible rows; Right opens or steps in, Left closes or steps out; Enter acts. */
function onKey(event: KeyboardEvent) {
  const id = (event.target as HTMLElement).dataset?.node
  const list = rows.value
  const i = list.findIndex(entry => entry.node.id === id)
  const row = list[i]
  if (!row) return
  let handled = true
  if (event.key === 'ArrowDown') focusRow(list[i + 1]?.node.id)
  else if (event.key === 'ArrowUp') focusRow(list[i - 1]?.node.id)
  else if (event.key === 'Home') focusRow(list[0]?.node.id)
  else if (event.key === 'End') focusRow(list[list.length - 1]?.node.id)
  else if (event.key === 'ArrowRight' && row.branch && row.open) focusRow(list[i + 1]?.node.id)
  else if (event.key === 'ArrowRight' && row.branch) toggle(row, true)
  else if (event.key === 'ArrowLeft' && row.branch && row.open) toggle(row, false)
  else if (event.key === 'ArrowLeft') focusRow(row.parent ?? undefined)
  else if (event.key === 'Enter' || event.key === ' ') press(row)
  else if (event.key === 'Delete' && row.node.remove) void remove(row)
  else handled = false
  if (handled) event.preventDefault()
}

</script>

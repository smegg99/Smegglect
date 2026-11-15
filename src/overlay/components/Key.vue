<!-- src/overlay/components/Key.vue -->
<template>
  <button
    ref="el"
    type="button"
    class="key"
    :class="{ labelled: !!caption }"
    :aria-label="label"
    :aria-pressed="pressed"
    :aria-expanded="expanded"
    :aria-haspopup="popup"
    :disabled="disabled"
    @pointerenter="show"
    @pointerleave="hide"
    @focus="show"
    @blur="hide"
    @click="hide"
  >
    <Icon :name="icon" />
    <span
      v-if="caption"
      class="caption"
    >{{ caption }}</span>
    <span
      v-if="badge"
      class="badge"
      aria-hidden="true"
    >{{ badge > 99 ? '99+' : badge }}</span>
  </button>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRuntime, type Tip } from '../runtime'
import { hideTip, showTip } from '../tip'
import Icon from './Icon.vue'

// Absent pressed/expanded must stay undefined, not Vue's boolean-cast false, so plain keys get no ARIA state.
const props = withDefaults(defineProps<{
  icon: string
  label: string
  kbd?: string
  pressed?: boolean
  expanded?: boolean
  popup?: 'menu'
  badge?: number
  caption?: string
  disabled?: boolean
  tipSide?: Tip['side']
}>(), {
  kbd: undefined,
  pressed: undefined,
  expanded: undefined,
  popup: undefined,
  badge: 0,
  caption: undefined,
  disabled: false,
  tipSide: 'above',
})

const { ui } = useRuntime()
const el = ref<HTMLButtonElement | null>(null)

function show() {
  // An open menu owns the space next to its key; a caption that already says everything needs no tip.
  if (props.expanded || !el.value || (props.caption === props.label && !props.kbd)) return
  showTip(ui, el.value, props.label, props.tipSide, props.kbd)
}

function hide() {
  hideTip(ui, props.label)
}

watch(() => props.expanded, (open) => {
  if (open) hide()
})

onBeforeUnmount(hide)

defineExpose({ el })
</script>

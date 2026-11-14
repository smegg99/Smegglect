<!-- src/overlay/components/Toast.vue -->
<template>
  <div
    v-if="shown"
    ref="el"
    class="float toast"
    :class="{ plain: !undoable }"
    role="status"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px`, visibility: placed ? 'visible' : 'hidden' }"
    @pointerenter="hold = true"
    @pointerleave="hold = false"
    @focusin="hold = true"
    @focusout="hold = false"
  >
    <span :class="{ warn: ui.message?.id === shownMessage && ui.message?.warn }">{{ text }}</span>
    <button
      v-if="undoable"
      type="button"
      class="key wide"
      @click="undo"
    >
      <Icon name="undo" />{{ t('toast.undo') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRuntime } from '../runtime'
import Icon from './Icon.vue'

const SHOW_MS = 5000

const { engine, state, settings, ui, t, doc } = useRuntime()
const shown = ref(false)
const hold = ref(false)
let timer: number | undefined

const notice = computed(() => state.value.notice)
const value = computed(() => notice.value?.value)
/** The newest of the two sources wins: an engine notice or an overlay message. */
const shownMessage = ref<number | null>(null)
/** Undo is offered only while it can still act: submission empties the queue and its history. */
const undoable = computed(() => {
  const v = value.value
  if (shownMessage.value !== null || !v || !state.value.drafts.undo.length) return false
  if (v.kind === 'added') return state.value.drafts.issues.some(i => i.id === v.issueId)
  return v.kind === 'removed'
})

const text = computed(() => {
  if (shownMessage.value !== null && ui.message?.id === shownMessage.value) return ui.message.text
  const v = value.value
  if (!v) return ''
  if (v.kind === 'added') return t('toast.added', { number: v.seq })
  if (v.kind === 'removed') return t('toast.removed')
  if (v.kind === 'undone') return t('toast.undone')
  if (v.kind === 'redone') return t('toast.redone')
  return ''
})

const el = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const placed = ref(false)

/** Directly beside the dock, on the side facing the page; never over the dock or the inspector. */
function reposition() {
  if (!el.value) return
  const { width, height } = el.value.getBoundingClientRect()
  const { width: vw, height: vh } = ui.viewport
  const panel = ui.panel?.box ?? null
  const avoid = [ui.dock, panel].filter(b => b !== null)
  const dock = ui.dock
  const p = settings.placement
  const near = dock
    ? p === 'top'
      ? [{ x: dock.x + dock.width / 2 - width / 2, y: dock.y + dock.height + 8 }]
      : p === 'left'
        ? [{ x: dock.x + dock.width + 8, y: dock.y + dock.height - height }]
        : p === 'right'
          ? [{ x: dock.x - width - 8, y: dock.y + dock.height - height }]
          : [{ x: dock.x + dock.width / 2 - width / 2, y: dock.y - height - 8 }, { x: dock.x + dock.width / 2 - width / 2, y: dock.y + dock.height + 8 }]
    : []
  const candidates = [...near, { x: 12, y: vh - height - 12 }, { x: 12, y: 12 }]
    .map(c => ({ x: Math.max(8, Math.min(c.x, vw - width - 8)), y: Math.max(8, Math.min(c.y, vh - height - 8)), width, height }))
  const free = candidates.find(c => !avoid.some(a => c.x < a.x + a.width && a.x < c.x + c.width && c.y < a.y + a.height && a.y < c.y + c.height))
  const box = free ?? candidates[0]!
  pos.value = { x: box.x, y: box.y }
  placed.value = true
}

watch(() => [shown.value, text.value, ui.dock, ui.panel, ui.viewport], () => {
  placed.value = false
  void nextTick(reposition)
})

function arm() {
  const win = doc.defaultView!
  win.clearTimeout(timer)
  timer = win.setTimeout(() => {
    if (hold.value) arm()
    else shown.value = false
  }, SHOW_MS)
}

watch(notice, (n) => {
  if (!n || n.value.kind === 'reference-invalid') return
  shownMessage.value = null
  if (!text.value) return
  shown.value = true
  arm()
})

watch(() => ui.message, (m) => {
  if (!m) return
  shownMessage.value = m.id
  shown.value = true
  arm()
})

function undo() {
  engine.undo()
}

onBeforeUnmount(() => doc.defaultView?.clearTimeout(timer))
</script>

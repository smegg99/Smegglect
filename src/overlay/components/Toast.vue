<!-- src/overlay/components/Toast.vue -->
<template>
  <!-- The live region stays mounted: one that appears together with its words is often not read out. -->
  <div
    class="toast-live"
    role="status"
  >
    <div
      v-if="shown"
      ref="el"
      class="float toast"
      :class="{ plain: !undoable && !action, 'in-panel': pos.width > 0 }"
      :style="{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: pos.width ? `${pos.width}px` : undefined,
        maxWidth: pos.width ? 'none' : undefined,
        visibility: placed ? 'visible' : 'hidden'
      }"
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
      <button
        v-else-if="action"
        type="button"
        class="key wide"
        @click="act"
      >
        <Icon name="locate" />{{ action.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRuntime, useSurface } from '../runtime'
import Icon from './Icon.vue'

const SHOW_MS = 5000

const { engine, state, settings, ui, t, doc } = useRuntime()
const surface = useSurface()
const shown = ref(false)
const hold = ref(false)
let timer: number | undefined

const notice = computed(() => state.value.notice)
const value = computed(() => notice.value?.value)
/** The newest of the two sources wins: an engine notice or an overlay message. */
const shownMessage = ref<number | null>(null)
/** Undo is offered only while it can still act: submission empties the queue and its history. */
const undoable = computed(() => {
  const latest = value.value
  if (shownMessage.value !== null || !latest || !state.value.drafts.undo.length) return false
  if (latest.kind === 'added') return state.value.drafts.issues.some(issue => issue.id === latest.issueId)
  return latest.kind === 'removed'
})

/** The key the shown message offers, e.g. Show on page; none for an engine notice. */
const action = computed(() => {
  const message = ui.message
  return shownMessage.value !== null && message?.id === shownMessage.value ? message.action : undefined
})

const text = computed(() => {
  if (shownMessage.value !== null && ui.message?.id === shownMessage.value) return ui.message.text
  const latest = value.value
  if (!latest) return ''
  if (latest.kind === 'added') return t('toast.added', { number: latest.seq })
  if (latest.kind === 'removed') return t('toast.removed')
  if (latest.kind === 'undone') return t('toast.undone')
  if (latest.kind === 'redone') return t('toast.redone')
  return ''
})

const el = ref<HTMLElement | null>(null)
/** Where the toast sits, and the width it may take there (none: its own maximum). */
const pos = ref({ x: 0, y: 0, width: 0 })
const placed = ref(false)

/** What the toast sits on in the open panel: the issue form or the foot with Send, else its bottom. */
function footOf(toast: HTMLElement, panel: { y: number, height: number }): number {
  const root = toast.getRootNode() as Document | ShadowRoot
  const foot = root.querySelector('.inspector .compose') ?? root.querySelector('.inspector > .foot')
  return foot?.getBoundingClientRect().y ?? panel.y + panel.height
}

/**
 * Never by the toolbar, whose keys it would crowd. While the panel is open it lies across the panel just
 * above the issue form or Send, where the action was; otherwise it sits at the edge away from the toolbar.
 * In the pop-out, under its toolbar.
 */
function reposition() {
  if (!el.value) return
  if (surface.window) {
    const { width } = el.value.getBoundingClientRect()
    const y = (ui.bar ? ui.bar.y + ui.bar.height : 0) + 8
    pos.value = { x: Math.max(8, (surface.viewport.width - width) / 2), y, width: 0 }
    placed.value = true
    return
  }
  const panel = ui.inspector ? ui.panel?.box ?? null : null
  if (panel) {
    const width = panel.width - 40
    const { height } = el.value.getBoundingClientRect()
    pos.value = { x: panel.x + 20, y: footOf(el.value, panel) - height - 8, width }
    placed.value = true
    return
  }
  const { width, height } = el.value.getBoundingClientRect()
  const { width: vw, height: vh } = ui.viewport
  // The edge the toolbar is on now, the dragged one mid-drag.
  const y = (ui.dock?.placement ?? settings.placement) === 'top' ? vh - height - 12 : 12
  pos.value = { x: Math.max(8, (vw - width) / 2), y, width: 0 }
  placed.value = true
}

watch(
  () => [
    shown.value, text.value, ui.inspector, ui.panel, ui.viewport, ui.bar, ui.dock?.placement,
    settings.placement, surface.window,
    surface.viewport.width,
  ],
  () => {
    placed.value = false
    void nextTick(reposition)
  },
)

function arm() {
  const win = doc.defaultView
  if (!win) return
  win.clearTimeout(timer)
  timer = win.setTimeout(() => {
    if (hold.value) arm()
    else shown.value = false
  }, SHOW_MS)
}

watch(notice, (raised) => {
  if (!raised || raised.value.kind === 'reference-invalid') return
  shownMessage.value = null
  if (!text.value) return
  shown.value = true
  arm()
})

watch(() => ui.message, (message) => {
  if (!message) return
  shownMessage.value = message.id
  shown.value = true
  arm()
})

function undo() {
  engine.undo()
}

function act() {
  action.value?.run()
  shown.value = false
}

onBeforeUnmount(() => doc.defaultView?.clearTimeout(timer))
</script>

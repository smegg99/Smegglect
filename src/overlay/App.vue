<!-- src/overlay/App.vue -->
<template>
  <div
    ref="root"
    class="sg"
    :data-theme="theme"
    :data-large="settings.large || undefined"
    :data-keyed="keyed || undefined"
    :lang="settings.locale"
    v-on="contain"
  >
    <template v-if="state.expanded">
      <Guides />
      <Shield v-if="mode === 'region'" />
      <FrameShield v-if="mode === 'pick' || mode === 'reference' || mode === 'anchor'" />
      <Annotations v-if="state.annotations" />
      <Inspector v-if="ui.inspector" />
      <Dock />
    </template>
    <Launcher v-else />
    <Toast />
    <Tip />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, provide, ref, watch } from 'vue'
import { hostScheme } from '../dom/capture'
import Dock from './components/Dock.vue'
import FrameShield from './components/FrameShield.vue'
import Guides from './components/Guides.vue'
import Launcher from './components/Launcher.vue'
import Annotations from './components/Annotations.vue'
import Inspector from './components/Inspector.vue'
import Shield from './components/Shield.vue'
import Tip from './components/Tip.vue'
import Toast from './components/Toast.vue'
import { DOC } from './context'
import { startFeed } from './feed'
import { marked } from './review'
import { sideFor } from './inspector'
import { createRuntime, RUNTIME } from './runtime'

const root = ref<HTMLElement | null>(null)
const keyed = ref(false)

/** Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y act on issues only while focus is in Smegglect and not in a text field. */
function undoKeys(e: KeyboardEvent) {
  const target = e.composedPath()[0] as HTMLElement | undefined
  if (!(e.ctrlKey || e.metaKey) || e.altKey || target?.closest?.('textarea, input')) return
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) runtime.engine.undo()
  else if ((k === 'z' && e.shiftKey) || k === 'y') runtime.engine.redo()
  else return
  e.preventDefault()
}

// Overlay input stops at its own root: host bubble listeners never see clicks or keys meant for Smegglect.
const CONTAINED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'keypress', 'input', 'change', 'focusin', 'focusout', 'wheel', 'touchstart', 'touchend'] as const
const contain = Object.fromEntries(CONTAINED.map(type => [type, (event: Event) => {
  if (type === 'keydown') {
    keyed.value = true
    undoKeys(event as KeyboardEvent)
  }
  // A press ends any tooltip: its key may vanish under the pointer (Cancel, Done) and never report leaving.
  if (type === 'pointerdown') {
    keyed.value = false
    runtime.ui.tip = null
  }
  event.stopPropagation()
}]))
const runtime = createRuntime(inject(DOC)!)
provide(RUNTIME, runtime)
const { state, geo, settings, ui } = runtime

const mode = computed(() => state.value.inspect.mode.kind)

const hostTheme = ref(hostScheme(runtime.doc))
const theme = computed(() => {
  if (settings.theme !== 'auto') return settings.theme
  return hostTheme.value === 'light' ? 'light' : 'dark'
})

// The page's theme is read again whenever the overlay comes forward; no observer runs in between.
watch(() => [state.value.expanded, ui.inspector], () => {
  hostTheme.value = hostScheme(runtime.doc)
})

// The bridge channel is open only while the overlay is, so a collapsed overlay costs nothing.
let stopFeed: (() => void) | null = null
watch(() => state.value.expanded, (open) => {
  stopFeed?.()
  stopFeed = open ? startFeed(runtime) : null
}, { immediate: true })
onBeforeUnmount(() => stopFeed?.())

// Sent issues the agent has touched stay marked on the page until the person accepts them.
watch(() => marked(runtime.sess.value).map(m => m.issue.id).join(), () => {
  runtime.engine.showSent(marked(runtime.sess.value).map(m => m.issue))
}, { immediate: true })

watch(() => state.value.focusRequest, () => {
  ui.focusDock = true
})

watch(() => state.value.expanded, (open) => {
  if (!open) {
    ui.inspector = false
    ui.tip = null
  }
})

// An issue being composed or a reference being picked lives in the inspector's Element tab.
watch(() => state.value.composing !== null || mode.value === 'reference' || mode.value === 'anchor', (busy) => {
  if (!busy) return
  ui.view = 'element'
  ui.inspector = true
})

// The form and the B or anchor step live in the Element tab; leaving it, or closing the inspector, ends them.
watch(() => ui.inspector && ui.view === 'element', (shown) => {
  if (shown) return
  if (state.value.composing) runtime.engine.cancelCompose()
  for (let guard = 0; guard < 4 && (mode.value === 'reference' || mode.value === 'anchor'); guard++) runtime.engine.escape()
})

// An opened issue keeps its target and plate in view, as a new selection does.
watch(() => ui.view === 'issue' ? ui.issue : null, (id) => {
  if (!id) return
  settings.side = sideFor(settings.side, geo.value.pins.find(p => p.id === id)?.rect ?? null, ui.viewport)
})

// A new selection opens the inspector on it, on the side that leaves the selection visible.
watch(() => state.value.selected, (selected, before) => {
  if (!selected || selected === before) return
  settings.side = sideFor(settings.side, geo.value.a, ui.viewport)
  ui.view = 'element'
  ui.inspector = true
})

defineExpose({ root })
</script>

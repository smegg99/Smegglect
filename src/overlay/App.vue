<!-- src/overlay/App.vue -->
<template>
  <div
    ref="root"
    class="sg"
    :data-theme="theme"
    :data-large="settings.large || undefined"
    :data-keyed="keyed || undefined"
    :lang="settings.locale"
    :style="accentStyle"
    v-on="contain"
  >
    <template v-if="state.expanded">
      <Guides />
      <Shield v-if="mode === 'region'" />
      <FrameShield v-if="mode === 'pick' || mode === 'reference' || mode === 'anchor'" />
      <Annotations v-if="state.annotations" />
    </template>
    <!-- Popped out, the page shows only its markers; the button returns when the window closes or Put back
         is pressed. -->
    <Dock v-if="!popout" />
    <!-- The page's own tooltips (plates) while the stage is in the pop-out. -->
    <Tip v-if="popout" />
    <!-- In the pop-out it is that window's overlay root; on the page it is a plain wrapper inside this
         one. -->
    <Stage
      v-bind="popout ? rootAttrs : {}"
      v-on="popout ? contain : {}"
    >
      <Transition name="sg-open">
        <Inspector v-if="state.expanded && (ui.inspector || popout)" />
      </Transition>
      <Toast />
      <Tip />
    </Stage>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, provide, ref, watch } from 'vue'
import { hostScheme } from '../dom/capture'
import Dock from './components/Dock.vue'
import FrameShield from './components/FrameShield.vue'
import Guides from './components/Guides.vue'
import Annotations from './components/Annotations.vue'
import Inspector from './components/Inspector.vue'
import Shield from './components/Shield.vue'
import Stage from './components/Stage.vue'
import Tip from './components/Tip.vue'
import Toast from './components/Toast.vue'
import { DOC, KIT } from './context'
import { refreshStatus, startFeed } from './feed'
import { restart } from './progress'
import { createRuntime, RUNTIME, SURFACE, type Surface } from './runtime'

const root = ref<HTMLElement | null>(null)
const keyed = ref(false)

/** Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y act on issues only while focus is in Smegglect and not in a text field. */
function undoKeys(event: KeyboardEvent) {
  const target = event.composedPath()[0] as HTMLElement | undefined
  if (!(event.ctrlKey || event.metaKey) || event.altKey || target?.closest?.('textarea, input')) return
  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) runtime.engine.undo()
  else if ((key === 'z' && event.shiftKey) || key === 'y') runtime.engine.redo()
  else return
  event.preventDefault()
}

// Overlay input stops at its own root: host bubble listeners never see clicks or keys meant for Smegglect.
const CONTAINED = [
  'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keyup',
  'keypress', 'input', 'change', 'focusin', 'focusout', 'wheel', 'touchstart', 'touchend',
] as const
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
const doc = inject(DOC)
if (!doc) throw new Error('smegglect: the overlay was mounted without its document')
const runtime = createRuntime(doc)
provide(RUNTIME, runtime)
const { state, settings, ui, popout } = runtime
provide<Surface>(SURFACE, {
  doc: runtime.doc,
  get viewport() {
    return ui.viewport
  },
  window: false,
})

const mode = computed(() => state.value.inspect.mode.kind)

const hostTheme = ref(hostScheme(runtime.doc))
const theme = computed(() => {
  if (settings.theme !== 'auto') return settings.theme
  return hostTheme.value === 'light' ? 'light' : 'dark'
})
// Vuetify's theme follows the overlay's: light or dark as resolved for the page, and the chosen accent.
const kit = inject(KIT, null)
watch(theme, current => kit?.setDark(current === 'dark'), { immediate: true })
watch(() => settings.accent, accent => kit?.setAccent(accent))
// S99AB's motion rules read `data-motion` on the root, which in the shadow root is the host element.
watch([root, () => settings.motion], ([element, motion]) => {
  const host = element?.getRootNode()
  if (!(host instanceof ShadowRoot)) return
  if (motion) host.host.removeAttribute('data-motion')
  else host.host.setAttribute('data-motion', 'off')
}, { immediate: true })

/** A chosen accent replaces the theme's selection colour; the tints derive from it. */
const accentStyle = computed(() => settings.accent ? { '--sg-select': settings.accent } : undefined)
const rootAttrs = computed(() => ({
  'class': 'sg',
  'data-theme': theme.value,
  'data-large': settings.large || undefined,
  'data-keyed': keyed.value || undefined,
  // S99AB's motion switch reads the same attribute on the shadow host; see the watch above.
  'data-motion': settings.motion ? undefined : 'off',
  'lang': settings.locale,
  'style': accentStyle.value,
}))

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

// Turned back on, the status is read at once, as a fresh start: what came meanwhile is not news.
watch(() => settings.agentStatus, (on) => {
  if (!on) return
  restart(runtime)
  void refreshStatus(runtime)
})

watch(() => state.value.focusRequest, () => {
  ui.focusDock = true
})

// The drawer folds away with the toolbar and, if it was open, comes back with it at the tab it showed.
let reopen = false
watch(() => state.value.expanded, (open) => {
  if (open) {
    ui.restored = reopen
    if (reopen) ui.inspector = true
    reopen = false
    return
  }
  reopen = ui.inspector
  ui.inspector = false
  ui.tip = null
})

// An issue being composed or a reference being picked lives in the inspector's Element tab.
watch(
  () => state.value.composing !== null || mode.value === 'reference' || mode.value === 'anchor',
  (busy) => {
    if (!busy) return
    ui.view = 'element'
    ui.inspector = true
  },
)

// The form and the B or anchor step live in the Element tab; leaving it, or closing the inspector, ends them.
watch(() => ui.inspector && ui.view === 'element', (shown) => {
  if (shown) return
  if (state.value.composing) runtime.engine.cancelCompose()
  for (let guard = 0; guard < 4 && (mode.value === 'reference' || mode.value === 'anchor'); guard++)
    runtime.engine.escape()
})

// A new selection opens the drawer on it; the drawer stays by the toolbar, which the person moves.
watch(() => state.value.selected, (selected, before) => {
  if (!selected || selected === before) return
  ui.view = 'element'
  ui.inspector = true
})

defineExpose({ root })
</script>

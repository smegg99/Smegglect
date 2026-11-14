<!-- src/overlay/components/Dock.vue -->
<template>
  <div
    ref="bar"
    class="float dock"
    :class="{ vertical }"
    role="toolbar"
    :aria-label="t('dock.toolbar')"
    :aria-orientation="vertical ? 'vertical' : 'horizontal'"
    :style="style"
    @keydown="onKey"
    @focusin="onFocus"
  >
    <Key
      icon="mark"
      :label="t('dock.collapse')"
      kbd="Alt+Shift+S"
      :tip-side="side"
      @click="engine.setExpanded(false)"
    />
    <span class="rule" />
    <Key
      icon="pick"
      :label="t('dock.pick')"
      kbd="Alt+Shift+P"
      shape="mode"
      :pressed="mode === 'pick'"
      :caption="captions ? t('dock.pickShort') : undefined"
      :tip-side="side"
      @click="engine.togglePick()"
    />
    <Key
      icon="region"
      :label="t('dock.region')"
      kbd="Alt+Shift+R"
      shape="mode"
      :pressed="mode === 'region'"
      :caption="captions ? t('dock.regionShort') : undefined"
      :tip-side="side"
      @click="engine.toggleRegion()"
    />
    <span class="rule" />
    <Key
      icon="measure"
      :label="t('dock.measure')"
      kbd="Alt+Shift+M"
      shape="view"
      :pressed="state.measuring"
      :caption="captions ? t('dock.measureShort') : undefined"
      :tip-side="side"
      @click="engine.setMeasuring(!state.measuring)"
    />
    <Key
      icon="annotations"
      :label="t('dock.annotations')"
      shape="view"
      :pressed="state.annotations"
      :caption="captions ? t('dock.annotationsShort') : undefined"
      :tip-side="side"
      @click="engine.setAnnotations(!state.annotations)"
    />
    <span class="rule" />
    <Key
      icon="undo"
      :label="t('dock.undo')"
      kbd="Alt+Shift+Z"
      :disabled="!state.drafts.undo.length"
      :caption="captions ? t('dock.undoShort') : undefined"
      :tip-side="side"
      @click="engine.undo()"
    />
    <Key
      icon="redo"
      :label="t('dock.redo')"
      kbd="Alt+Shift+Y"
      :disabled="!state.drafts.redo.length"
      :caption="captions ? t('dock.redoShort') : undefined"
      :tip-side="side"
      @click="engine.redo()"
    />
    <span class="rule" />
    <Key
      icon="issues"
      :label="count ? `${t('dock.issues')}, ${t('dock.drafts', { count })}` : t('dock.issues')"
      :badge="count"
      :expanded="ui.inspector && ui.view !== 'element'"
      :caption="captions ? t('dock.issues') : undefined"
      :tip-side="side"
      @click="toggleIssues"
    />
    <Key
      ref="moreKey"
      icon="more"
      :label="t('dock.more')"
      :expanded="menu"
      popup="menu"
      :caption="captions ? t('dock.more') : undefined"
      :tip-side="side"
      @click="menu = !menu"
    />
  </div>
  <!-- Outside the dock: its centring transform would become the fixed-position containing block. -->
  <MoreMenu
    v-if="menu"
    :anchor="menuAnchor"
    :opener="moreEl"
    :side="side"
    @close="menu = false"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRuntime } from '../runtime'
import Key from './Key.vue'
import MoreMenu from './MoreMenu.vue'

const { engine, state, settings, ui, t } = useRuntime()
const bar = ref<HTMLElement | null>(null)
const moreKey = ref<InstanceType<typeof Key> | null>(null)
const menu = ref(false)
const focusAt = ref(1)

const mode = computed(() => state.value.inspect.mode.kind)
const count = computed(() => state.value.drafts.issues.length)
const vertical = computed(() => settings.placement === 'left' || settings.placement === 'right')
/** Captions need room; on narrow viewports the dock falls back to icons with tooltips. */
/** Captions need room; on narrow viewports the dock falls back to icons with tooltips. Nothing else changes it. */
const captions = computed(() => settings.labels && (vertical.value ? ui.viewport.height >= 640 : ui.viewport.width >= 640))
const side = computed(() => ({ bottom: 'above', top: 'below', left: 'right', right: 'left' } as const)[settings.placement])
const moreEl = computed(() => moreKey.value?.el ?? null)
const menuAnchor = computed(() => (menu.value && moreEl.value ? moreEl.value.getBoundingClientRect() : null))

/** Fixed to its edge; the inspector fits around it, so opening panels never moves it. */
const style = computed(() => {
  const p = settings.placement
  if (p === 'top') return { top: '12px', left: '50%', transform: 'translateX(-50%)' }
  if (p === 'left') return { left: '12px', top: '50%', transform: 'translateY(-50%)' }
  if (p === 'right') return { right: '12px', top: '50%', transform: 'translateY(-50%)' }
  return { bottom: '12px', left: '50%', transform: 'translateX(-50%)' }
})

function toggleIssues() {
  if (ui.inspector && ui.view === 'issues') {
    ui.inspector = false
    return
  }
  ui.view = 'issues'
  ui.inspector = true
}

function keys(): HTMLElement[] {
  return [...(bar.value?.querySelectorAll<HTMLElement>(':scope > .key:not(:disabled)') ?? [])]
}

function roving() {
  keys().forEach((k, i) => k.setAttribute('tabindex', i === focusAt.value ? '0' : '-1'))
}

function onFocus(event: FocusEvent) {
  const i = keys().indexOf(event.target as HTMLElement)
  if (i >= 0 && i !== focusAt.value) {
    focusAt.value = i
    roving()
  }
}

function onKey(event: KeyboardEvent) {
  const list = keys()
  const i = list.indexOf(event.target as HTMLElement)
  if (i < 0) return
  const fwd = vertical.value ? 'ArrowDown' : 'ArrowRight'
  const back = vertical.value ? 'ArrowUp' : 'ArrowLeft'
  let next: number
  if (event.key === fwd) next = (i + 1) % list.length
  else if (event.key === back) next = (i - 1 + list.length) % list.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = list.length - 1
  else return
  event.preventDefault()
  focusAt.value = next
  roving()
  list[next]?.focus()
}

function measure() {
  ui.dock = bar.value ? bar.value.getBoundingClientRect() : null
}

let observer: ResizeObserver | null = null
onMounted(async () => {
  await nextTick()
  roving()
  measure()
  if (ui.focusDock) {
    ui.focusDock = false
    keys()[focusAt.value]?.focus()
  }
  const RO = bar.value?.ownerDocument.defaultView?.ResizeObserver
  if (RO && bar.value) {
    observer = new RO(measure)
    observer.observe(bar.value)
  }
})
watch(() => [settings.placement, settings.large, settings.labels, ui.viewport], () => nextTick(() => {
  measure()
  roving()
}))
onBeforeUnmount(() => {
  observer?.disconnect()
  ui.dock = null
})
</script>

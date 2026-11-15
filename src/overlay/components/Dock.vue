<!-- src/overlay/components/Dock.vue -->
<!-- On the page: the button, dragged along any edge, with the toolbar unfolding from it. In the pop-out: a
     ribbon under the panel's tabs, led by Put back. -->
<template>
  <div
    ref="bar"
    class="dock"
    :class="[
      inWindow ? 'ribbon' : ['float', spot.placement],
      { vertical: lay.vertical, reversed: lay.reversed, wrapped, captions, dragging: !!dragSpot }
    ]"
    role="toolbar"
    :aria-label="t('dock.toolbar')"
    :aria-orientation="lay.vertical ? 'vertical' : 'horizontal'"
    :style="lay.style"
    @keydown="onKey"
    @focusin="onFocus"
  >
    <Key
      v-if="!inWindow"
      class="toggle"
      :icon="state.expanded ? 'pawOpen' : 'pawClosed'"
      :label="state.expanded ? t('dock.collapse') : openLabel"
      kbd="Alt+Shift+S"
      :tip-side="side"
      @pointerdown="grab"
      @click="toggle"
    />
    <template v-if="tools">
      <template
        v-for="(group, index) in groups"
        :key="group[0]?.id ?? index"
      >
        <span
          v-if="ruleBefore(index, group)"
          class="rule"
        />
        <Key
          v-for="tool in group"
          :key="tool.id"
          :ref="tool.id === 'more' ? setMore : undefined"
          :data-tool="tool.id"
          :icon="tool.icon"
          :label="tool.label"
          :kbd="tool.kbd"
          :pressed="tool.pressed"
          :expanded="tool.expanded"
          :popup="tool.popup"
          :disabled="tool.disabled"
          :badge="tool.badge"
          :caption="captions ? tool.caption : undefined"
          :tip-side="side"
          @click="tool.act()"
        />
      </template>
    </template>
  </div>
  <MoreMenu
    v-if="menu && tools"
    :anchor="menuAnchor"
    :opener="moreEl"
    :side="side"
    @close="menu = false"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { unfold, type Spot, type Unfold } from '../button'
import { useButtonDrag } from '../button-drag'
import { dockTools, openLabel as openText, type Tool, type ToolInput } from '../dock-tools'
import { useRuntime, useSurface } from '../runtime'
import Key from './Key.vue'
import MoreMenu from './MoreMenu.vue'

const { engine, state, settings, ui, t, popout, putBack } = useRuntime()
const surface = useSurface()
/** The toolbar inside the pop-out window rather than the button on the page. */
const inWindow = computed(() => surface.window)
const bar = ref<HTMLElement | null>(null)
const moreKey = ref<InstanceType<typeof Key> | null>(null)
const setMore = (key: unknown) => (moreKey.value = key as InstanceType<typeof Key> | null)
const menu = ref(false)
const focusAt = ref(0)


const { dragSpot, grab, swallowed } = useButtonDrag(settings, ui, () => {
  menu.value = false
  ui.tip = null
})
const remembered = computed<Spot>(() => ({ placement: settings.placement, offset: settings.offset }))
const spot = computed<Spot>(() => dragSpot.value ?? remembered.value)
/**
 * Captions need room; without it the keys fall back to icons with tooltips. A toolbar on a side edge has
 * none: captions differ in width, and the button would be narrower than its column. Set before the toolbar
 * opens, so the folded button already has the row's size.
 */
const captions = computed(() => {
  if (!settings.labels) return false
  if (inWindow.value) return surface.viewport.width >= 380
  // On a side edge captions differ in width; kept there only when the person asks for one size everywhere.
  const along = spot.value.placement === 'top' || spot.value.placement === 'bottom'
  return (along || settings.steadySize) && ui.viewport.width >= 640
})
/**
 * The row (a key, 8 px taller with captions) plus 3 px padding and a 1 px frame on each side, as
 * surfaces.css draws it.
 */
const size = computed(() => (settings.large ? 36 : 32) + (captions.value ? 8 : 0) + 8)
const lay = computed<Unfold>(() => {
  if (inWindow.value) return { style: {}, vertical: false, reversed: false }
  return unfold(spot.value, ui.viewport, size.value)
})
/** On the page the tools show while expanded, unless they are in the pop-out; a drag carries them along. */
const tools = computed(() => inWindow.value || (state.value.expanded && !popout.value))

const toolInput = computed<ToolInput>(() => ({
  engine,
  state: state.value,
  ui,
  t,
  inWindow: inWindow.value,
  menuOpen: menu.value,
  putBack,
  toggleIssues,
  toggleSettings,
  toggleMenu: () => (menu.value = !menu.value),
}))
const groups = computed<Tool[][]>(() => dockTools(toolInput.value, lay.value.reversed))
const openLabel = computed(() => openText(toolInput.value))

/** In the ribbon More stands apart at the far end, without a rule; on the page each group has one. */
function ruleBefore(index: number, group: Tool[]): boolean {
  if (!inWindow.value) return true
  return index > 0 && group[0]?.id !== 'more'
}

const TIP_SIDES = { bottom: 'above', top: 'below', left: 'right', right: 'left' } as const
const side = computed(() => inWindow.value ? 'below' : TIP_SIDES[spot.value.placement])
const moreEl = computed(() => moreKey.value?.el ?? null)
const menuAnchor = computed(() => (menu.value && moreEl.value ? moreEl.value.getBoundingClientRect() : null))

/** Settings is a view of its own; the same key closes it again, back to the issues in the pop-out. */
function toggleSettings() {
  if (ui.inspector && ui.view === 'settings') {
    if (inWindow.value) ui.view = 'issues'
    else ui.inspector = false
    return
  }
  ui.view = 'settings'
  ui.inspector = true
}

function toggleIssues() {
  if (ui.inspector && ui.view === 'issues') {
    ui.inspector = false
    return
  }
  ui.view = 'issues'
  ui.inspector = true
}

/**
 * Focus stays on the button, which stays put: the same press closes again. Alt+Shift+S moves focus to
 * Pick.
 */
function toggle() {
  if (swallowed()) return
  engine.setExpanded(!state.value.expanded)
}

function keys(): HTMLElement[] {
  return [...(bar.value?.querySelectorAll<HTMLElement>(':scope > .key:not(:disabled)') ?? [])]
}

function roving() {
  keys().forEach((key, i) => key.setAttribute('tabindex', i === focusAt.value ? '0' : '-1'))
}

function onFocus(event: FocusEvent) {
  const i = keys().indexOf(event.target as HTMLElement)
  if (i >= 0 && i !== focusAt.value) {
    focusAt.value = i
    roving()
  }
}

/** The arrows that step forward and back as the keys are drawn: tools before the button run backwards. */
function arrows(): { forward: string, back: string } {
  const { vertical, reversed } = lay.value
  const [ahead, behind] = vertical ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft']
  return reversed ? { forward: behind, back: ahead } : { forward: ahead, back: behind }
}

/** Where a key press moves focus among `length` keys from `i`; null for a key that does not move it. */
function stepTo(key: string, i: number, length: number): number | null {
  const { forward, back } = arrows()
  if (key === forward) return (i + 1) % length
  if (key === back) return (i - 1 + length) % length
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  return null
}

function onKey(event: KeyboardEvent) {
  const list = keys()
  const i = list.indexOf(event.target as HTMLElement)
  if (i < 0) return
  const next = stepTo(event.key, i, list.length)
  if (next === null) return
  event.preventDefault()
  focusAt.value = next
  roving()
  list[next]?.focus()
}

function measure() {
  const box = bar.value ? bar.value.getBoundingClientRect() : null
  if (inWindow.value) ui.bar = box
  // The edge it is drawn on, the dragged one mid-drag, so the panel moves out of its way as it goes.
  else ui.dock = box ? { box, placement: spot.value.placement, reversed: lay.value.reversed } : null
}

/** Opening from the keyboard lands on Pick, wherever the layout draws it. */
function focusTools() {
  if (!ui.focusDock || !tools.value) return
  ui.focusDock = false
  const list = keys()
  focusAt.value = Math.max(0, list.findIndex(key => key.dataset.tool === 'pick'))
  roving()
  list[focusAt.value]?.focus()
}

/**
 * A wrapped toolbar drops its rules, which would start a row; it stays so until its room or contents
 * change.
 */
const wrapped = ref(false)
function checkWrap() {
  const element = bar.value
  if (!element || !tools.value) return
  const vertical = lay.value.vertical
  const keyCross = Math.max(0, ...keys().map(key => (vertical ? key.offsetWidth : key.offsetHeight)))
  // The client box holds 3 px of padding on each side.
  wrapped.value = (vertical ? element.clientWidth : element.clientHeight) - 6 > keyCross + 1
}

// Only an open toolbar changes size by itself (captions, wrapping); the lone button costs nothing while
// collapsed.
let observer: ResizeObserver | null = null
function observe(shown: boolean) {
  observer?.disconnect()
  observer = null
  const Observer = bar.value?.ownerDocument.defaultView?.ResizeObserver
  if (!shown || !Observer || !bar.value) return
  observer = new Observer(measure)
  observer.observe(bar.value)
}
onMounted(async () => {
  await nextTick()
  checkWrap()
  roving()
  measure()
  focusTools()
  observe(tools.value)
})
// Its room changes with every step of a drag, so whether it wraps and where it is are read again each time.
watch(
  () => [
    spot.value, tools.value, settings.large, settings.labels, settings.locale, groups.value.flat().length,
    ui.viewport, surface.viewport.width, surface.viewport.height,
  ],
  () => {
    wrapped.value = false
    void nextTick(() => {
      checkWrap()
      measure()
    })
  },
)
// The keys' order and roving focus change only when the tools do or the toolbar turns or flips.
watch(
  () => [tools.value, groups.value.flat().length, lay.value.vertical, lay.value.reversed],
  () => nextTick(() => {
    roving()
    focusTools()
  }),
)
watch(() => ui.focusDock, () => nextTick(focusTools))
watch(dragSpot, dragged => (ui.dragging = !!dragged))
watch(tools, (shown) => {
  if (!shown) menu.value = false
  void nextTick(() => observe(shown))
})
onBeforeUnmount(() => {
  observer?.disconnect()
  if (inWindow.value) ui.bar = null
  else ui.dock = null
})
</script>

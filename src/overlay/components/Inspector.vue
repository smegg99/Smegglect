<!-- src/overlay/components/Inspector.vue -->
<template>
  <section
    ref="el"
    class="float inspector"
    :class="inWindow ? 'window' : ['drawer', layout.edge, { short, dragging: ui.dragging }]"
    :style="inWindow ? undefined : {
      left: `${layout.box.x}px`,
      top: `${layout.box.y}px`,
      width: `${layout.box.width}px`,
      height: `${layout.box.height}px`
    }"
    role="complementary"
    :aria-label="t('inspector.title')"
    tabindex="-1"
  >
    <header class="bar">
      <div
        v-if="waiting"
        class="waiting"
        role="status"
      >
        <span
          class="waiting-text"
          :title="waiting"
        ><span
          v-if="mode === 'reference'"
          class="tag b"
        >B</span>{{ waiting }}</span>
        <span
          v-if="grouping"
          class="members"
        >{{ t('strip.elements', { count: members }) }}</span>
        <!-- One way out: Done while building a group, Cancel otherwise; the tooltip names Esc. -->
        <button
          type="button"
          class="key wide"
          :class="{ primary: grouping }"
          @click="engine.escape()"
          @pointerenter="showTip(ui, $event.currentTarget as Element, finish, 'below', 'Esc')"
          @pointerleave="hideTip(ui, finish)"
        >
          {{ finish }}
        </button>
        <span
          v-if="warning"
          class="warn"
        >{{ warning }}</span>
      </div>
      <div
        v-else
        class="tabstrip"
        role="tablist"
        :aria-label="t('inspector.title')"
        @keydown="onTabKey"
      >
        <!-- Settings is a pinned tab, as S99AB draws one: its icon alone, named in its tooltip. -->
        <button
          v-for="tab in tabs"
          :id="`sg-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          :class="[{ pinned: tab.pinned }, tab.id === 'issues' ? flashClass(ui.flash) : undefined]"
          :data-tab="tab.id"
          :aria-controls="current === tab.id ? 'sg-tabpanel' : undefined"
          :aria-selected="current === tab.id"
          :aria-label="tab.pinned ? tab.label : undefined"
          :tabindex="current === tab.id ? 0 : -1"
          @click="ui.view = tab.id"
          @pointerenter="tab.pinned && showTip(ui, $event.currentTarget as Element, tab.label, 'below')"
          @pointerleave="tab.pinned && hideTip(ui, tab.label)"
        >
          <Icon :name="tab.icon" /><span
            v-if="!tab.pinned"
            class="label"
          >{{ tab.label }}</span>
        </button>
      </div>
      <!-- Only the tabs and Close: moving the panel and popping it out are in the toolbar's More menu. -->
      <Key
        v-if="!waiting && !inWindow"
        icon="close"
        :label="t('inspector.close')"
        tip-side="below"
        @click="ui.inspector = false"
      />
    </header>
    <Dock v-if="inWindow" />
    <ElementTab v-if="ui.view === 'element'" />
    <IssuesTab v-else-if="ui.view === 'issues'" />
    <div
      v-else-if="ui.view === 'history'"
      id="sg-tabpanel"
      class="body"
      role="tabpanel"
      aria-labelledby="sg-tab-history"
    >
      <History />
    </div>
    <SettingsTab v-else-if="ui.view === 'settings'" />
    <IssueView
      v-else-if="ui.view === 'issue' && shown"
      :key="shown.id"
      :issue="shown"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { flashClass } from '../flash'
import { panelLayout } from '../inspector'
import { presetLabel } from '../labels'
import { hideTip, showTip } from '../tip'
import { closeIssue } from '../navigate'
import { useRuntime, useSurface } from '../runtime'
import Dock from './Dock.vue'
import ElementTab from './ElementTab.vue'
import History from './History.vue'
import IssuesTab from './IssuesTab.vue'
import IssueView from './IssueView.vue'
import Icon from './Icon.vue'
import Key from './Key.vue'
import SettingsTab from './SettingsTab.vue'

const { engine, state, sess, ui, t } = useRuntime()
const surface = useSurface()
/** In the pop-out the panel fills the window under the toolbar. */
const inWindow = computed(() => surface.window)
const el = ref<HTMLElement | null>(null)

/** The issue in the issue view: a draft, or one in a submitted batch. */
const shown = computed(() => {
  const id = ui.issue
  if (!id) return null
  return state.value.drafts.issues.find(issue => issue.id === id)
    ?? sess.value.submitted.flatMap(batch => batch.issues).find(issue => issue.id === id)
    ?? null
})

const current = computed(() => ui.view === 'issue' ? ui.back : ui.view)
/** The count of issues is on the toolbar's Issues key; the tabs carry names only. */
const tabs = computed(() => [
  { id: 'element' as const, icon: 'pick', label: t('inspector.element'), pinned: false },
  { id: 'issues' as const, icon: 'issues', label: t('history.issuesTab'), pinned: false },
  { id: 'history' as const, icon: 'history', label: t('history.tab'), pinned: false },
  { id: 'settings' as const, icon: 'settings', label: t('settings.title'), pinned: true },
])

/** Left and Right move between tabs and open them, as a tab strip does. */
function onTabKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  const list = tabs.value
  const i = list.findIndex(tab => tab.id === current.value)
  const next = list[(i + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]
  if (!next) return
  const strip = event.currentTarget as HTMLElement
  ui.view = next.id
  event.preventDefault()
  void nextTick(() => strip.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
}

const mode = computed(() => state.value.inspect.mode.kind)

const waiting = computed(() => {
  const inspectMode = state.value.inspect.mode
  if (inspectMode.kind === 'reference') return t('reference.pickB', {
    preset: presetLabel(engine.registry.byId.get(inspectMode.preset), inspectMode.preset, t),
  })
  if (inspectMode.kind === 'anchor') return t('reference.pickAnchor')
  if (inspectMode.kind === 'pick') {
    return state.value.extend ? t('inspector.grouping') : t('inspector.picking')
  }
  if (inspectMode.kind === 'region') return t('inspector.drawing')
  return ''
})

const grouping = computed(() => mode.value === 'pick' && state.value.extend)
const members = computed(() => {
  const selected = state.value.selected
  if (!selected) return 0
  if (selected.kind === 'group') return selected.descriptors.length
  return 1
})
const finish = computed(() => grouping.value ? t('inspector.done') : t('reference.cancel'))

/** Shown until the next valid pick; the notice id ties it to this operation. */
const warning = computed(() => {
  const notice = state.value.notice?.value
  if (!waiting.value || !notice || notice.kind !== 'reference-invalid') return ''
  if (notice.reason === 'same') return t('reference.same')
  if (notice.reason === 'member') return t('reference.member')
  return t('reference.outsideGroup')
})

/** Below 400 px the issue form is not pinned to the drawer's foot: it would leave too little above it. */
const short = computed(() => layout.value.box.height < 400)
/** The toolbar the drawer opens from, kept while the overlay folds, so the drawer leaves at its size. */
const anchor = ref(ui.dock)
watch(() => ui.dock, (dock) => {
  if (state.value.expanded && dock) anchor.value = dock
})
const layout = computed(() => panelLayout(ui.viewport, anchor.value))

// An issue that is gone (undone, deleted elsewhere) leaves its view.
watchEffect(() => {
  if (ui.view === 'issue' && !shown.value) closeIssue(ui)
})

// The toast and the dock keep clear of the panel while it is on the page.
watchEffect(() => {
  ui.panel = inWindow.value ? null : layout.value
})

// Closed last: Escape first unwinds forms, modes and the selection. The pop-out is the panel; it stays.
const release = engine.pushLayer(() => {
  if (!inWindow.value) ui.inspector = false
}, 'last')

let opener: HTMLElement | null = null

onMounted(async () => {
  const root = el.value?.getRootNode() as ShadowRoot | undefined
  opener = (root?.activeElement as HTMLElement | null) ?? null
  if (ui.restored) {
    ui.restored = false
    return
  }
  await nextTick()
  el.value?.focus({ preventScroll: true })
})

onBeforeUnmount(() => {
  release()
  ui.panel = null
  const root = el.value?.getRootNode() as ShadowRoot | undefined
  if (opener?.isConnected && (!root?.activeElement || el.value?.contains(root.activeElement))) opener.focus()
})
</script>

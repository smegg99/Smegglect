<!-- src/overlay/components/Inspector.vue -->
<template>
  <section
    ref="el"
    class="float inspector"
    :class="[layout.kind, layout.edge]"
    :style="{ left: `${layout.box.x}px`, top: `${layout.box.y}px`, width: `${layout.box.width}px`, height: `${layout.box.height}px` }"
    role="complementary"
    :aria-label="t('inspector.title')"
    tabindex="-1"
  >
    <header
      ref="head"
      class="bar"
    >
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
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="current === tab.id"
          :tabindex="current === tab.id ? 0 : -1"
          @click="ui.view = tab.id"
        >
          <Icon :name="tab.icon" /><span class="label">{{ tab.label }}</span><span
            v-if="tab.count !== undefined"
            class="count"
          >{{ tab.count }}</span>
        </button>
      </div>
      <Key
        v-if="!waiting"
        icon="close"
        :label="t('inspector.close')"
        tip-side="below"
        @click="ui.inspector = false"
      />
    </header>
    <ElementTab v-if="ui.view === 'element'" />
    <IssuesTab v-else-if="ui.view === 'issues'" />
    <div
      v-else-if="ui.view === 'history'"
      class="body"
      role="tabpanel"
    >
      <History />
    </div>
    <IssueView
      v-else-if="ui.view === 'issue' && shown"
      :key="shown.id"
      :issue="shown"
    />
    <ReportView v-else-if="ui.view === 'report' && ui.report" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { panelLayout } from '../inspector'
import { presetLabel } from '../labels'
import { hideTip, showTip } from '../tip'
import { closeIssue } from '../navigate'
import { useRuntime } from '../runtime'
import ElementTab from './ElementTab.vue'
import History from './History.vue'
import IssuesTab from './IssuesTab.vue'
import IssueView from './IssueView.vue'
import Icon from './Icon.vue'
import Key from './Key.vue'
import ReportView from './ReportView.vue'

const { engine, state, geo, sess, settings, ui, t } = useRuntime()
const el = ref<HTMLElement | null>(null)
const head = ref<HTMLElement | null>(null)
const headHeight = ref(40)

/** The issue in the issue view: a draft, or one in a submitted batch. */
const shown = computed(() => {
  const id = ui.issue
  if (!id) return null
  return state.value.drafts.issues.find(i => i.id === id) ?? sess.value.submitted.flatMap(b => b.issues).find(i => i.id === id) ?? null
})

const current = computed(() => ui.view === 'issue' ? ui.back : ui.view === 'report' ? 'issues' : ui.view)
const tabs = computed(() => [
  { id: 'element' as const, icon: 'pick', label: t('inspector.element'), count: undefined },
  { id: 'issues' as const, icon: 'issues', label: t('history.issuesTab'), count: state.value.drafts.issues.length },
  { id: 'history' as const, icon: 'history', label: t('history.tab'), count: undefined },
])

/** Left and Right move between tabs and open them, as a tab strip does. */
function onTabKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  const list = tabs.value
  const i = list.findIndex(tab => tab.id === current.value)
  const next = list[(i + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]!
  const strip = event.currentTarget as HTMLElement
  ui.view = next.id
  event.preventDefault()
  void nextTick(() => strip.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
}

const mode = computed(() => state.value.inspect.mode.kind)
/** The panel shrinks to its header while Smegglect waits for a click on the page; the header says what to click. */
const peek = computed(() => mode.value !== 'pass')

const waiting = computed(() => {
  const m = state.value.inspect.mode
  if (m.kind === 'reference') return t('reference.pickB', { preset: presetLabel(engine.registry.byId.get(m.preset), m.preset, t) })
  if (m.kind === 'anchor') return t('reference.pickAnchor')
  if (m.kind === 'pick') return state.value.extend ? t('inspector.grouping') : t('inspector.picking')
  if (m.kind === 'region') return t('inspector.drawing')
  return ''
})

const grouping = computed(() => mode.value === 'pick' && state.value.extend)
const members = computed(() => {
  const s = state.value.selected
  return s?.kind === 'group' ? s.descriptors.length : s ? 1 : 0
})
const finish = computed(() => grouping.value ? t('inspector.done') : t('reference.cancel'))

/** Shown until the next valid pick; the notice id ties it to this operation. */
const warning = computed(() => {
  const n = state.value.notice?.value
  if (!peek.value || !n || n.kind !== 'reference-invalid') return ''
  return n.reason === 'same' ? t('reference.same') : n.reason === 'member' ? t('reference.member') : t('reference.outsideGroup')
})

const dock = computed(() => ui.dock ? { box: ui.dock, placement: settings.placement } : null)
const options = computed(() => ({ wide: ui.view === 'report', selection: geo.value.a, head: headHeight.value, dock: dock.value }))
const layout = computed(() => panelLayout(ui.viewport, settings.side, { ...options.value, peek: peek.value }))

// An issue that is gone (undone, deleted elsewhere) leaves its view.
watchEffect(() => {
  if (ui.view === 'issue' && !shown.value) closeIssue(ui)
})

// The toast keeps clear of the full panel, so it does not jump while the panel is shrunk.
watchEffect(() => {
  ui.panel = panelLayout(ui.viewport, settings.side, { ...options.value, peek: false })
})

// Closed last: Escape first unwinds forms, modes and the selection.
const release = engine.pushLayer(() => {
  ui.inspector = false
}, 'last')

let opener: HTMLElement | null = null

let observer: ResizeObserver | null = null

onMounted(async () => {
  const root = el.value?.getRootNode() as ShadowRoot | undefined
  opener = (root?.activeElement as HTMLElement | null) ?? null
  await nextTick()
  // The header grows when an instruction wraps; a shrunk panel must still show all of it.
  const measure = () => {
    if (head.value) headHeight.value = Math.ceil(head.value.getBoundingClientRect().height) + 2
  }
  measure()
  const RO = el.value?.ownerDocument.defaultView?.ResizeObserver
  if (RO && head.value) {
    observer = new RO(measure)
    observer.observe(head.value)
  }
  el.value?.focus({ preventScroll: true })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  release()
  ui.panel = null
  const root = el.value?.getRootNode() as ShadowRoot | undefined
  if (opener?.isConnected && (!root?.activeElement || el.value?.contains(root.activeElement))) opener.focus()
})
</script>

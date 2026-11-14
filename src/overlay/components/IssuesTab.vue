<!-- src/overlay/components/IssuesTab.vue -->
<template>
  <div
    class="body"
    role="tabpanel"
  >
    <EmptyState
      v-if="!issues.length && !sess.submitted.length"
      icon="issues"
      :title="t('inspector.noIssues')"
      :text="t('drawer.empty')"
    >
      <button
        type="button"
        class="tile"
        @click="startPicking"
      >
        <Icon name="pick" /><span class="label">{{ t('inspector.startPicking') }}</span><kbd>Alt+Shift+P</kbd>
      </button>
    </EmptyState>
    <Tree
      v-if="nodes.length"
      name="issues"
      :label="t('history.issuesTab')"
      :nodes="nodes"
      @activate="node => openIssue(ui, node.id)"
      @hover="node => (ui.hover = node?.id ?? null)"
      @link="node => goTo(node.attrs?.['data-page'] ?? '')"
    />
    <template v-if="sess.submitted.length">
      <h3 class="section">
        {{ t('history.reports') }}
      </h3>
      <SubmittedRow
        v-for="batch in sess.submitted"
        :key="batch.id"
        :batch="batch"
      />
    </template>
  </div>
  <footer class="foot">
    <p
      v-if="storageWarn"
      class="status"
      role="status"
    >
      <span :class="{ warn: storageWarn }">{{ storageText }}</span>
      <button
        v-if="sess.status.kind === 'corrupt'"
        type="button"
        class="key wide raised"
        @click="engine.session.discardStored()"
      >
        {{ t('storage.discard') }}
      </button>
    </p>
    <p
      v-if="engine.bridge && ui.bridge !== 'unknown'"
      class="status"
      role="status"
    >
      <span :class="{ warn: ui.bridge === 'offline' }">{{ ui.bridge === 'connected' ? t('bridge.connected', { url: engine.bridge.url }) : t('bridge.offline') }}</span>
    </p>
    <button
      v-if="issues.length"
      type="button"
      class="key wide primary block"
      @click="openReport(ui, { tab: 'summary', note: '', batchId: null })"
    >
      <Icon name="report" />{{ t('report.open', { count: issues.length }) }}
    </button>
  </footer>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Issue } from '../../core/model'
import { cleanLocation } from '../../core/redact'
import { issueTitle, pageLabel, subjectOf } from '../labels'
import { openIssue, openReport } from '../navigate'
import { marked, stateText } from '../review'
import { useRuntime } from '../runtime'
import EmptyState from './EmptyState.vue'
import Icon from './Icon.vue'
import Tree, { type TreeNode } from './Tree.vue'
import SubmittedRow from './SubmittedRow.vue'

const rt = useRuntime()
const { engine, state, geo, sess, ui, t, doc } = rt
const issues = computed(() => state.value.drafts.issues)
const status = computed(() => new Map(geo.value.pins.map(p => [p.id, p.status])))

/** Issues grouped by the page they were captured on; this page first. */
const groups = computed(() => {
  const here = cleanLocation(doc.defaultView!.location.href)
  const map = new Map<string, { key: string, location: string, label: string, here: boolean, issues: Issue[] }>()
  for (const i of issues.value) {
    const c = i.evidence.capture
    const key = `${c.location}|${c.screen ?? ''}`
    const g = map.get(key) ?? { key, location: c.location, label: pageLabel(c.location, c.screen), here: c.location === here, issues: [] }
    g.issues.push(i)
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) => Number(b.here) - Number(a.here))
})

/** Picking ends on the Element tab: a new selection opens it there. */
function startPicking() {
  if (state.value.inspect.mode.kind !== 'pick') engine.togglePick()
}

function statusText(status: string): string {
  if (status === 'unavailable') return t('drawer.statusUnavailable')
  if (status === 'ambiguous') return t('drawer.statusAmbiguous')
  if (status === 'elsewhere') return t('drawer.statusElsewhere')
  return ''
}

/** Sent issues the agent answered, first: reachable here even when their plate is out of sight. */
const answers = computed<TreeNode[]>(() => {
  const list = marked(sess.value)
  if (!list.length) return []
  return [{
    id: 'answers',
    label: t('inspector.answers'),
    children: list.map(({ issue, state: s }) => ({
      id: issue.id,
      label: issueTitle(issue, engine.registry, t),
      badge: String(issue.seq),
      icon: engine.registry.byId.get(issue.intent.preset.id)?.icon ?? 'note',
      meta: stateText(rt, s),
      attrs: { 'data-sent': issue.id },
    })),
  }]
})

/** Pages are branches, issues their rows: number, icon, title and target; a lost target says so. */
const nodes = computed<TreeNode[]>(() => [...answers.value, ...groups.value.map(g => ({
  id: `page:${g.key}`,
  label: g.here ? t('history.thisPage') : g.label,
  ...(g.here ? {} : { link: t('history.goTo') }),
  attrs: { 'data-page': g.location },
  children: g.issues.map((issue) => {
    const st = status.value.get(issue.id)
    const lost = st && st !== 'live' ? statusText(st) : ''
    return {
      id: issue.id,
      label: issueTitle(issue, engine.registry, t),
      badge: String(issue.seq),
      icon: engine.registry.byId.get(issue.intent.preset.id)?.icon ?? 'note',
      meta: subjectOf(issue, t).a,
      ...(lost ? { warn: true, tip: lost, sr: lost } : {}),
      attrs: { 'data-issue': issue.id, ...(st ? { 'data-status': st } : {}) },
    }
  }),
}))])

function goTo(location: string) {
  // Same-origin pages only: the location was captured from this app.
  const win = doc.defaultView!
  if (new URL(location).origin === win.location.origin) win.location.assign(location)
}

const storageText = computed(() => {
  const s = sess.value.status
  if (s.kind === 'saved') return t('storage.saved')
  if (s.kind === 'idle') return t('storage.idle')
  if (s.kind === 'memory') return t('storage.memory')
  if (s.kind === 'failed') return s.error === 'quota' ? t('storage.quota') : t('storage.failed')
  if (s.kind === 'corrupt') return t('storage.corrupt')
  if (s.kind === 'forked') return t('storage.forked')
  return ''
})
const storageWarn = computed(() => !['saved', 'idle', 'loading'].includes(sess.value.status.kind))

async function checkBridge() {
  const bridge = engine.bridge
  if (!bridge) return
  ui.bridge = await bridge.health() ? 'connected' : 'offline'
  const ids = ui.bridge === 'connected' ? await bridge.listIds() : null
  if (ids) engine.session.markShared(ids)
}

onMounted(() => {
  void checkBridge()
})
</script>

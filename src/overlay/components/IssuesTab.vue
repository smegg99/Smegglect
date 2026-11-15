<!-- src/overlay/components/IssuesTab.vue -->
<template>
  <div
    id="sg-tabpanel"
    class="body"
    role="tabpanel"
    aria-labelledby="sg-tab-issues"
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
      @act="act"
    />
  </div>
  <footer class="foot">
    <p
      v-if="storageWarn"
      class="status"
      role="status"
    >
      <span class="warn">{{ storageText }}</span>
      <button
        v-if="sess.status.kind === 'corrupt'"
        type="button"
        class="key wide raised"
        @click="engine.session.discardStored()"
      >
        {{ t('storage.discard') }}
      </button>
    </p>
    <!-- One line about Claude above Send: an icon for its state, its words, the app that carries them. -->
    <p
      v-if="engine.bridge && ui.bridge !== 'unknown'"
      class="status claude"
      :data-state="claude.state"
      role="status"
    >
      <Icon :name="claude.state" /><span class="said">{{ claude.line }}</span><span
        v-if="via"
        class="via"
      >{{ via }}</span>
    </p>
    <template v-if="issues.length">
      <button
        v-if="sending"
        type="button"
        class="key wide primary block"
        @click="shareBatch(rt)"
      >
        <Icon name="crab" />{{ t('report.send') }}
      </button>
      <div class="actions send">
        <button
          type="button"
          class="key wide"
          :class="sending ? 'raised' : 'primary'"
          @click="copyPrompt(rt)"
        >
          <Icon name="copy" />{{ t('report.copy') }}
        </button>
        <button
          type="button"
          class="key wide raised"
          @click="exportBatch(rt)"
        >
          <Icon name="download" />{{ t('report.download') }}
        </button>
      </div>
    </template>
  </footer>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Issue } from '../../core/model'
import { cleanLocation } from '../../core/redact'
import { issueTitle, pageLabel, progressOf, shortTime, statusText, subjectOf } from '../labels'
import { copyPrompt, exportBatch, shareBatch } from '../exporting'
import { refreshStatus } from '../feed'
import { openIssue } from '../navigate'
import { useRuntime } from '../runtime'
import EmptyState from './EmptyState.vue'
import Icon from './Icon.vue'
import Tree, { type TreeNode } from './Tree.vue'

const rt = useRuntime()
const { engine, state, geo, sess, settings, ui, t, doc } = rt
const issues = computed(() => state.value.drafts.issues)
/** With the bridge up, sending to the agent is the main way out; copying and saving stay beside it. */
const sending = computed(() => !!engine.bridge && ui.bridge === 'connected')
const status = computed(() => new Map(geo.value.pins.map(pin => [pin.id, pin.status])))
/** The page's own words about the agent, never anything it wrote; off in Settings. */
const agentStatus = computed(() => {
  return settings.agentStatus && ui.bridge === 'connected' ? ui.agentStatus : null
})
/**
 * Whether anyone is there to take what is sent, or busy with it, in the page's words. The state is the icon:
 * `linked` until the agent is known, `unlinked` when the bridge does not answer.
 */
const claude = computed(() => {
  if (ui.bridge !== 'connected') return { state: 'unlinked', line: t('bridge.offline') }
  const agent = agentStatus.value?.agent
  if (!agent) return { state: 'linked', line: t('bridge.ready') }
  const isClaude = agent.kind === 'claude'
  if (ui.checking) {
    const seq = ui.checking.seq
    const line = isClaude ? t('bridge.checkingClaude', { seq }) : t('bridge.checkingOther', { seq })
    return { state: 'locate', line }
  }
  if (agent.listening) {
    return { state: 'listening', line: isClaude ? t('bridge.listeningClaude') : t('bridge.listeningOther') }
  }
  // Not listening because it is working: it has a sent report.
  if (Object.values(agentStatus.value?.batches ?? {}).includes('taken')) {
    return { state: 'working', line: isClaude ? t('bridge.workingClaude') : t('bridge.workingOther') }
  }
  if (agent.lastSeenAgo === null) return { state: 'nobody', line: t('bridge.noAgent') }
  const minutes = Math.max(1, Math.round(agent.lastSeenAgo / 60_000))
  const line = isClaude ? t('bridge.seenClaude', { minutes }) : t('bridge.seenOther', { minutes })
  return { state: 'away', line }
})
const REPORT_TEXT = {
  waiting: 'bridge.reportWaiting',
  stalled: 'bridge.reportStalled',
  done: 'bridge.reportDone',
} as const
function reportText(batchId: string): string | undefined {
  const status = agentStatus.value
  const progress = status?.batches[batchId]
  if (!progress) return undefined
  if (progress !== 'taken') return t(REPORT_TEXT[progress])
  return status.agent.kind === 'claude' ? t('bridge.reportTakenClaude') : t('bridge.reportTakenOther')
}

/** The app a desktop window sends through; a bridge reached directly has no name to show. */
const via = computed(() => {
  const label = engine.bridge?.label
  return label && ui.bridge === 'connected' ? t('bridge.via', { name: label }) : ''
})

/** Issues grouped by the page they were captured on; this page first. */
const groups = computed(() => {
  const here = cleanLocation(doc.location.href)
  const map = new Map<string, {
    key: string,
    location: string,
    label: string,
    here: boolean,
    issues: Issue[],
  }>()
  for (const issue of issues.value) {
    const capture = issue.evidence.capture
    const key = `${capture.location}|${capture.screen ?? ''}`
    const group = map.get(key) ?? {
      key,
      location: capture.location,
      label: pageLabel(capture.location, capture.screen),
      here: capture.location === here,
      issues: [],
    }
    group.issues.push(issue)
    map.set(key, group)
  }
  return [...map.values()].sort((first, second) => Number(second.here) - Number(first.here))
})

/** Picking ends on the Element tab: a new selection opens it there. */
function startPicking() {
  if (state.value.inspect.mode.kind !== 'pick') engine.togglePick()
}

const when = (at: string | undefined) => at ? shortTime(at, settings.locale) : ''

/** Sent reports, newest first: each one by its time, with its keys, and its issues. */
const sent = computed<TreeNode[]>(() => {
  const list = sess.value.submitted
  if (!list.length) return []
  return [{
    id: 'sent',
    label: t('history.reports'),
    children: list.map(batch => ({
      id: `batch:${batch.id}`,
      label: when(batch.submittedAt),
      meta: reportText(batch.id),
      open: false,
      attrs: { 'data-batch': batch.id },
      actions: [
        ...(sending.value && !sess.value.shared[batch.id]
          ? [{ id: 'send', icon: 'open', label: t('report.send') }]
          : []),
        { id: 'copy', icon: 'copy', label: t('report.copy') },
        { id: 'zip', icon: 'download', label: t('report.download') },
        { id: 'delete', icon: 'remove', label: t('submitted.delete') },
      ],
      children: batch.issues.map(issue => ({
        ...issueRow(issue, engine.locate(issue), { 'data-sent-issue': issue.id }),
        ...progressRow(batch.id, issue.id),
      })),
    })),
  }]
})

/** How far the agent has got with a sent issue; nothing while the status is off or the bridge is away. */
function progressRow(batchId: string, issueId: string): Pick<TreeNode, 'state'> {
  const status = agentStatus.value
  const progress = status?.issues?.[batchId]?.[issueId]
  return progress ? { state: progressOf(progress, status.agent.kind, t) } : {}
}

function act(node: TreeNode, action: string) {
  const id = node.id.slice('batch:'.length)
  if (action === 'send') void shareBatch(rt, id)
  else if (action === 'copy') void copyPrompt(rt, id)
  else if (action === 'zip') void exportBatch(rt, id)
  else if (action === 'delete') engine.session.deleteBatch(id)
}

/** One issue's row: number, icon, title and target; a target that is not drawn here says why. */
function issueRow(issue: Issue, where: string | undefined, attrs: Record<string, string>): TreeNode {
  const lost = where && where !== 'live' ? statusText(where, t) : ''
  return {
    id: issue.id,
    label: issueTitle(issue, engine.registry, t),
    badge: String(issue.seq),
    icon: engine.registry.byId.get(issue.intent.preset.id)?.icon ?? 'note',
    meta: subjectOf(issue, t).a,
    ...(lost ? { warn: true, tip: lost, sr: lost } : {}),
    attrs,
  }
}

/** Pages are branches, issues their rows; a lost target says so. */
const nodes = computed<TreeNode[]>(() => [...groups.value.map(group => ({
  id: `page:${group.key}`,
  // A page is a heading only: the overlay never navigates the app away from where the person is.
  label: group.here ? t('history.thisPage') : group.label,
  attrs: { 'data-page': group.location },
  children: group.issues.map((issue) => {
    const where = status.value.get(issue.id)
    return issueRow(issue, where, { 'data-issue': issue.id, ...(where ? { 'data-status': where } : {}) })
  }),
})), ...sent.value])

const storageText = computed(() => {
  const storage = sess.value.status
  if (storage.kind === 'saved') return t('storage.saved')
  if (storage.kind === 'idle') return t('storage.idle')
  if (storage.kind === 'memory') return t('storage.memory')
  if (storage.kind === 'failed') return storage.error === 'quota' ? t('storage.quota') : t('storage.failed')
  if (storage.kind === 'corrupt') return t('storage.corrupt')
  if (storage.kind === 'forked') return t('storage.forked')
  return ''
})
const storageWarn = computed(() => !['saved', 'idle', 'loading'].includes(sess.value.status.kind))

async function checkBridge() {
  const bridge = engine.bridge
  if (!bridge) return
  const health = await bridge.health()
  ui.bridge = health ? 'connected' : 'offline'
  ui.bridgeHealth = health
  if (health) await refreshStatus(rt)
  const ids = ui.bridge === 'connected' ? await bridge.listIds() : null
  if (ids) engine.session.markShared(ids)
}

onMounted(() => {
  void checkBridge()
})
</script>

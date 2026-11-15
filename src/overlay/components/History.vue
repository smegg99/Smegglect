<!-- src/overlay/components/History.vue -->
<template>
  <EmptyState
    v-if="!sess.history.length"
    icon="history"
    :title="t('inspector.noHistory')"
    :text="t('history.empty')"
  />
  <ol
    v-else
    class="history"
  >
    <li
      v-for="entry in sess.history"
      :key="entry.id"
    >
      <Icon :name="iconOf(entry)" />
      <span class="what">
        <button
          v-if="entry.issueId && live.has(entry.issueId)"
          type="button"
          class="link"
          @click="show(entry.issueId)"
        >{{ text(entry) }}</button>
        <span v-else>{{ text(entry) }}</span>
        <span class="when">{{ when(entry.at) }}<template
          v-if="entry.target"
        > - {{ entry.target }}</template></span>
      </span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgentState, HistoryEvent } from '../../core/model'
import { choiceLabel, presetLabel, shortTime } from '../labels'
import { openIssue } from '../navigate'
import { useRuntime } from '../runtime'
import EmptyState from './EmptyState.vue'
import Icon from './Icon.vue'

const { engine, state, sess, settings, ui, t } = useRuntime()
const live = computed(() => new Set(state.value.drafts.issues.map(issue => issue.id)))

const ICON: Record<HistoryEvent['kind'], string> = {
  added: 'check', edited: 'note', removed: 'remove', undone: 'undo', redone: 'redo', submitted: 'report',
  copied: 'copy', exported: 'download', shared: 'open', taken: 'taken', checked: 'locate', answered: 'check',
}
/** An answer shows the state the agent gave, as the Issues tab does. */
const ANSWERED: Record<AgentState, string> = {
  'in-progress': 'working', 'needs-review': 'check', 'partial': 'partial', 'blocked': 'blocked',
}
function iconOf(entry: HistoryEvent): string {
  if (entry.kind === 'answered' && entry.state) return ANSWERED[entry.state]
  return ICON[entry.kind] ?? 'history'
}
/** The agent's steps: its name, and what it did. */
const ANSWER_TEXT: Record<AgentState, string> = {
  'in-progress': 'history.started', 'needs-review': 'history.fixed', 'partial': 'history.partial',
  'blocked': 'history.blocked',
}
function agentStep(entry: HistoryEvent): string {
  const agent = entry.agent === 'claude' ? t('history.agentClaude') : t('history.agentOther')
  const seq = entry.seq ?? 0
  if (entry.kind === 'taken') return t('history.taken', { agent })
  if (entry.kind === 'checked') return t('history.checked', { agent, seq })
  return t(ANSWER_TEXT[entry.state ?? 'needs-review'], { agent, seq })
}

function title(entry: HistoryEvent): string {
  if (!entry.preset) return ''
  const def = engine.registry.byId.get(entry.preset)
  const key = def?.choice?.key
  const option = key ? entry.params?.[key] : undefined
  return option ? choiceLabel(def, option, t) : presetLabel(def, entry.preset, t)
}

function text(entry: HistoryEvent): string {
  const number = entry.seq ?? 0
  switch (entry.kind) {
    case 'added': return t('history.added', { number, title: title(entry) })
    case 'edited': return t('history.edited', { number })
    case 'removed': return t('history.removed', { number, title: title(entry) })
    case 'undone': return t('history.undone')
    case 'redone': return t('history.redone')
    case 'submitted': return t('history.submitted', { count: entry.count ?? 0 })
    case 'copied': return t('history.copied')
    case 'exported': return t('history.exported')
    case 'shared': return t('history.shared')
    case 'taken':
    case 'checked':
    case 'answered': return agentStep(entry)
    default: return entry.kind
  }
}

const when = (at: string) => shortTime(at, settings.locale)

/** Opens the issue in the panel; the page stays where it is (the issue view has a key to scroll to it). */
function show(id: string) {
  openIssue(ui, id)
}
</script>

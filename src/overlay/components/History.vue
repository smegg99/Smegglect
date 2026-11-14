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
      v-for="e in sess.history"
      :key="e.id"
    >
      <Icon :name="iconOf(e.kind)" />
      <span class="what">
        <button
          v-if="e.issueId && live.has(e.issueId)"
          type="button"
          class="link"
          @click="show(e.issueId)"
        >{{ text(e) }}</button>
        <span v-else>{{ text(e) }}</span>
        <span class="when">{{ when(e.at) }}<template v-if="e.target"> - {{ e.target }}</template></span>
      </span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HistoryEvent } from '../../core/model'
import { choiceLabel, presetLabel } from '../labels'
import { openIssue } from '../navigate'
import { useRuntime } from '../runtime'
import EmptyState from './EmptyState.vue'
import Icon from './Icon.vue'

const { engine, state, sess, settings, ui, t } = useRuntime()
const live = computed(() => new Set(state.value.drafts.issues.map(i => i.id)))

const ICON: Record<HistoryEvent['kind'], string> = {
  added: 'check', edited: 'note', removed: 'remove', undone: 'undo', redone: 'redo', submitted: 'report',
  copied: 'copy', exported: 'download', shared: 'open', reviewed: 'favourite', result: 'history',
}
const iconOf = (k: HistoryEvent['kind']) => ICON[k] ?? 'history'

const STATE: Record<string, string> = {
  'accepted': 'review.accepted', 'reopened': 'review.reopened', 'partial': 'review.partial', 'needs-review': 'review.needsReview',
}

function title(e: HistoryEvent): string {
  if (!e.preset) return ''
  const def = engine.registry.byId.get(e.preset)
  const key = def?.choice?.key
  const option = key ? e.params?.[key] : undefined
  return option ? choiceLabel(def, option, t) : presetLabel(def, e.preset, t)
}

function text(e: HistoryEvent): string {
  const number = e.seq ?? 0
  switch (e.kind) {
    case 'added': return t('history.added', { number, title: title(e) })
    case 'edited': return t('history.edited', { number })
    case 'removed': return t('history.removed', { number, title: title(e) })
    case 'undone': return t('history.undone')
    case 'redone': return t('history.redone')
    case 'submitted': return t('history.submitted', { count: e.count ?? 0 })
    case 'copied': return t('history.copied')
    case 'exported': return t('history.exported')
    case 'shared': return t('history.shared')
    case 'reviewed': return t('history.reviewed', { number, state: t(STATE[e.detail ?? ''] ?? 'review.submitted') })
    default: return e.kind
  }
}

function when(at: string): string {
  try {
    return new Intl.DateTimeFormat(settings.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(at))
  }
  catch {
    return at
  }
}

function show(id: string) {
  openIssue(ui, id)
  engine.reveal(id)
}
</script>

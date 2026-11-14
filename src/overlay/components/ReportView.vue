<!-- src/overlay/components/ReportView.vue -->
<template>
  <section
    ref="el"
    class="report-view"
    :aria-label="t('report.title')"
    tabindex="-1"
  >
    <header class="report-head">
      <Key
        icon="back"
        :label="t('inspector.back')"
        tip-side="below"
        @click="closeReport(ui)"
      />
      <h2>{{ t('report.title') }}</h2>
      <div
        class="tabs"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="r.tab === 'summary'"
          @click="r.tab = 'summary'"
        >
          {{ t('report.summary') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="r.tab === 'markdown'"
          @click="r.tab = 'markdown'"
        >
          {{ t('report.markdown') }}
        </button>
      </div>
    </header>
    <p
      v-if="r.note"
      class="notice warn"
      role="alert"
    >
      {{ r.note }}
    </p>
    <div
      v-if="r.tab === 'summary'"
      class="body"
    >
      <section
        v-for="g in groups"
        :key="g.key"
        class="page"
      >
        <h3 class="section">
          {{ g.label }}
        </h3>
        <article
          v-for="i in g.issues"
          :key="i.id"
          class="entry"
        >
          <header>
            <span class="num">{{ i.seq }}</span>
            <strong>{{ issueTitle(i, engine.registry, t) }}</strong>
          </header>
          <p class="says">
            {{ describe(subjectOf(i, t), engine.registry, t) }}
          </p>
          <Comparison
            v-if="table(i)"
            :data="table(i)!"
          />
          <dl>
            <template v-if="i.intent.note">
              <dt>{{ t('report.note') }}</dt>
              <dd class="said">
                {{ i.intent.note }}
              </dd>
            </template>
            <dt>{{ t('report.scope') }}</dt>
            <dd>{{ t(SCOPE[i.intent.scope]) }}</dd>
            <template v-if="i.intent.constraints.length">
              <dt>{{ t('report.keep') }}</dt>
              <dd>{{ i.intent.constraints.map(c => t(`drawer.${camel(c)}`)).join(', ') }}</dd>
            </template>
          </dl>
        </article>
      </section>
    </div>
    <textarea
      v-else
      ref="text"
      class="field text"
      readonly
      :value="markdown"
      :aria-label="t('report.markdown')"
    />
    <footer class="foot">
      <p
        v-if="!r.batchId"
        class="dest"
      >
        {{ t('report.freezes') }}
      </p>
      <div class="actions">
        <button
          type="button"
          class="key wide raised"
          @click="copyPrompt(rt, r.batchId)"
        >
          <Icon name="copy" />{{ t('report.copy') }}
        </button>
        <button
          type="button"
          class="key wide raised"
          @click="exportBatch(rt, r.batchId)"
        >
          <Icon name="download" />{{ t('report.download') }}
        </button>
        <button
          v-if="engine.bridge && ui.bridge === 'connected'"
          type="button"
          class="key wide primary"
          @click="shareBatch(rt, r.batchId)"
        >
          <Icon name="open" />{{ t('report.share') }}
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { compare } from '../../core/compare'
import type { Issue, Scope } from '../../core/model'
import { copyPrompt, exportBatch, shareBatch } from '../exporting'
import { describe, issueTitle, pageLabel, subjectOf } from '../labels'
import { closeReport } from '../navigate'
import { useRuntime } from '../runtime'
import Comparison from './Comparison.vue'
import Icon from './Icon.vue'
import Key from './Key.vue'

const rt = useRuntime()
const { engine, state, sess, ui, t } = rt
const el = ref<HTMLElement | null>(null)
const text = ref<HTMLTextAreaElement | null>(null)
const r = computed(() => ui.report!)

const SCOPE: Record<Scope, string> = { occurrence: 'drawer.scopeOccurrence', screen: 'drawer.scopeScreen', component: 'drawer.scopeComponent' }
const camel = (s: string) => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())

const batch = computed(() => {
  void state.value.drafts
  return (r.value.batchId ? sess.value.submitted.find(b => b.id === r.value.batchId) : null) ?? engine.session.draftBatch()
})
const markdown = computed(() => engine.session.markdown(batch.value))
const table = (i: Issue) => {
  const c = compare(engine.registry.byId.get(i.intent.preset.id), i.intent.params, i.evidence.a, i.evidence.b)
  return c && c.rows.length ? c : null
}

const groups = computed(() => {
  const map = new Map<string, { key: string, label: string, issues: Issue[] }>()
  for (const i of batch.value.issues) {
    const c = i.evidence.capture
    const key = `${c.location}|${c.screen ?? ''}`
    const g = map.get(key) ?? { key, label: pageLabel(c.location, c.screen), issues: [] }
    g.issues.push(i)
    map.set(key, g)
  }
  return [...map.values()]
})

// Escape goes back to the issue list before it closes anything else.
const release = engine.pushLayer(() => closeReport(ui), 'view')

// After a failed copy the Markdown is shown selected, so Ctrl+C is the only step left.
watch(() => [r.value.tab, r.value.note], async () => {
  await nextTick()
  if (r.value.tab === 'markdown' && r.value.note && text.value) {
    text.value.focus()
    text.value.select()
  }
}, { immediate: true })

onMounted(() => {
  if (!r.value.note) el.value?.focus()
})
onBeforeUnmount(release)
</script>

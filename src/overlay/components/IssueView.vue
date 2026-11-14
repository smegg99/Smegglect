<!-- src/overlay/components/IssueView.vue -->
<template>
  <div
    class="body issue-view"
    role="tabpanel"
  >
    <header class="issue-head">
      <Key
        icon="back"
        :label="t('inspector.back')"
        tip-side="below"
        @click="closeIssue(ui)"
      />
      <span
        class="num"
        :data-status="status"
      >{{ issue.seq }}</span>
      <h2>{{ title }}</h2>
      <Key
        v-if="status === 'live'"
        icon="locate"
        :label="t('card.show')"
        tip-side="below"
        @click="engine.reveal(issue.id)"
      />
      <Key
        icon="attach"
        :label="t('attach.add')"
        tip-side="below"
        :disabled="!canEdit"
        @click="picker?.click()"
      />
      <Key
        icon="favourite"
        :label="isFavourite ? t('drawer.unfavourite') : t('drawer.favourite')"
        :pressed="isFavourite"
        tip-side="below"
        @click="toggleFavourite"
      />
      <Key
        icon="remove"
        :label="t('drawer.delete')"
        tip-side="below"
        :disabled="!canEdit"
        @click="remove"
      />
      <input
        ref="picker"
        class="picker"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        :aria-label="t('attach.add')"
        @change="attach"
      >
    </header>
    <p class="says">
      {{ sentence }}
    </p>
    <section
      v-if="sent && result"
      class="result"
    >
      <h3 class="section">
        {{ t('review.agentSays') }}<span
          class="state"
          :data-state="sent.state"
        >{{ stateText(rt, sent.state) }}</span>
      </h3>
      <p class="said">
        {{ result.text }}
      </p>
      <p
        v-if="result.files?.length"
        class="dest"
      >
        {{ t('review.files') }}: {{ result.files.join(', ') }}
      </p>
      <p
        v-if="result.checks?.length"
        class="dest"
      >
        {{ t('review.checks') }}: {{ result.checks.map(c => `${c.command} (${outcome(c.outcome)})`).join('; ') }}
      </p>
      <div
        v-if="sent.state !== 'accepted'"
        class="actions review"
      >
        <button
          type="button"
          class="key wide primary"
          @click="decide('accepted')"
        >
          <Icon name="check" />{{ t('review.accept') }}
        </button>
        <button
          type="button"
          class="key wide raised"
          :aria-expanded="reopening"
          @click="reopening = !reopening"
        >
          {{ t('review.reopen') }}
        </button>
      </div>
      <template v-if="reopening">
        <div
          class="seg wrap"
          role="group"
          :aria-label="t('review.reopen')"
        >
          <button
            v-for="r in REOPEN_REASONS"
            :key="r"
            type="button"
            :aria-pressed="reason === r"
            @click="reason = reason === r ? null : r"
          >
            {{ reasonText(rt, r) }}
          </button>
        </div>
        <textarea
          v-model="said"
          class="field"
          :maxlength="LIMITS.note"
          :aria-label="t('review.whatWrong')"
          :placeholder="t('review.whatWrong')"
        />
        <div class="actions review">
          <button
            type="button"
            class="key wide primary"
            :disabled="!reason && !said.trim()"
            @click="sendBack"
          >
            {{ t('review.sendBack') }}
          </button>
        </div>
      </template>
    </section>
    <p
      v-if="status && status !== 'live'"
      class="notice"
    >
      <span class="warn">{{ statusText }}</span>
    </p>
    <p
      v-if="issue.status === 'draft' && !canEdit"
      class="dest"
    >
      {{ t('drawer.unsupported') }}
    </p>
    <Comparison
      v-if="table"
      :data="table"
    />
    <div class="field-group">
      <label
        class="label"
        :for="`note-${issue.id}`"
      >{{ t('drawer.note') }}</label>
      <textarea
        :id="`note-${issue.id}`"
        ref="noteField"
        class="field"
        :value="issue.intent.note"
        :maxlength="LIMITS.note"
        :disabled="!canEdit"
        :placeholder="t('composer.placeholder')"
        @change="note"
      />
    </div>
    <details class="fold keep">
      <summary class="section">
        <Icon name="chevronRight" />{{ t('compose.details') }}
      </summary>
      <div class="label">
        {{ t('drawer.scope') }}
      </div>
      <div
        class="seg"
        role="group"
        :aria-label="t('drawer.scope')"
      >
        <button
          v-for="s in scopes"
          :key="s.value"
          type="button"
          :aria-pressed="issue.intent.scope === s.value"
          :disabled="!canEdit"
          @click="engine.editIssue(issue.id, { scope: s.value })"
        >
          {{ t(s.label) }}
        </button>
      </div>
      <div class="label">
        {{ t('drawer.keep') }}
      </div>
      <div class="checks">
        <label
          v-for="c in CONSTRAINTS"
          :key="c"
          class="check"
        >
          <input
            type="checkbox"
            :checked="issue.intent.constraints.includes(c)"
            :disabled="!canEdit"
            @change="toggle(c)"
          >
          {{ t(`drawer.${camel(c)}`) }}
        </label>
      </div>
    </details>
    <div
      v-if="files.length || attachError"
      class="files"
    >
      <div
        v-for="a in files"
        :key="a.id"
        class="file"
      >
        <img
          v-if="engine.session.preview(a.id)"
          :src="engine.session.preview(a.id)!"
          :alt="t('attach.alt', { name: a.name })"
        >
        <span class="meta">
          <span>{{ a.name }}</span>
          <span :class="{ warn: a.review === 'pending' }">{{ a.review === 'approved' ? t('attach.approved') : t('attach.pending') }}</span>
        </span>
        <Key
          v-if="a.review === 'pending'"
          icon="check"
          :label="t('attach.approve')"
          @click="engine.session.approve(a.id)"
        />
        <Key
          icon="close"
          :label="t('attach.remove')"
          @click="engine.session.detach(a.id)"
        />
      </div>
      <p
        v-if="files.length"
        class="dest"
      >
        {{ t('attach.noRedaction') }}
      </p>
      <p
        v-if="attachError"
        class="dest warn"
        role="alert"
      >
        {{ attachError }}
      </p>
    </div>
    <details class="fold">
      <summary class="section">
        <Icon name="chevronRight" />{{ t('drawer.task') }}
      </summary>
      <p class="task">
        {{ task }}
      </p>
    </details>
    <details class="fold">
      <summary class="section">
        <Icon name="chevronRight" />{{ t('drawer.evidence') }}
      </summary>
      <pre class="evidence">{{ evidence }}</pre>
    </details>
    <p class="meta-line">
      {{ t('card.captured', { when }) }} - {{ pageLabel(issue.evidence.capture.location, issue.evidence.capture.screen) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { compare } from '../../core/compare'
import { px } from '../../core/geometry'
import { CONSTRAINTS, type ConstraintId, type FollowUp, type Issue, type Rect, type Scope } from '../../core/model'
import { editable } from '../../core/presets'
import { REOPEN_REASONS } from '../../core/review'
import { intentSentence } from '../../core/task'
import { LIMITS } from '../../core/validate'
import { describe, issueTitle, pageLabel, subjectOf } from '../labels'
import { closeIssue } from '../navigate'
import { reasonText, reviewIssue, sentIssues, stateText } from '../review'
import { useRuntime } from '../runtime'
import Comparison from './Comparison.vue'
import Icon from './Icon.vue'
import Key from './Key.vue'

const props = defineProps<{ issue: Issue }>()
const rt = useRuntime()
const { engine, geo, sess, settings, ui, t } = rt
const picker = ref<HTMLInputElement | null>(null)
const noteField = ref<HTMLTextAreaElement | null>(null)
const attachError = ref('')

/** A sent issue: its review state and the agent's latest result. */
const sent = computed(() => sentIssues(sess.value).find(s => s.issue.id === props.issue.id) ?? null)
const result = computed(() => {
  const s = sent.value
  return s ? [...(sess.value.followUps[s.batchId] ?? [])].reverse().find(f => f.issueId === props.issue.id && f.kind === 'result') ?? null : null
})
const reopening = ref(false)
const reason = ref<FollowUp['reason'] | null>(null)
const said = ref('')
const outcome = (o: string) => o === 'passed' ? t('review.passed') : o === 'failed' ? t('review.failedCheck') : t('review.notRun')

async function decide(state: 'accepted') {
  reopening.value = false
  await reviewIssue(rt, sent.value!.batchId, props.issue.id, state)
}

/** Reopens with the reason and what the person wrote, both for the agent to read. */
async function sendBack() {
  await reviewIssue(rt, sent.value!.batchId, props.issue.id, 'reopened', { ...(reason.value ? { reason: reason.value } : {}), text: said.value.trim() })
  reopening.value = false
  reason.value = null
  said.value = ''
}

const camel = (s: string) => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())
const def = computed(() => engine.registry.byId.get(props.issue.intent.preset.id))
const canEdit = computed(() => props.issue.status === 'draft' && editable(engine.registry, props.issue.intent.preset))
const title = computed(() => issueTitle(props.issue, engine.registry, t))
const sentence = computed(() => describe(subjectOf(props.issue, t), engine.registry, t))
const task = computed(() => intentSentence(props.issue, engine.registry))
const files = computed(() => sess.value.attachments.filter(a => a.issueId === props.issue.id))
const status = computed(() => geo.value.pins.find(p => p.id === props.issue.id)?.status)
const table = computed(() => {
  const c = compare(def.value, props.issue.intent.params, props.issue.evidence.a, props.issue.evidence.b)
  return c && c.rows.length ? c : null
})
const when = computed(() => {
  try {
    return new Intl.DateTimeFormat(settings.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(props.issue.createdAt))
  }
  catch {
    return props.issue.createdAt
  }
})

const statusText = computed(() => {
  if (status.value === 'unavailable') return t('drawer.statusUnavailable')
  if (status.value === 'ambiguous') return t('drawer.statusAmbiguous')
  if (status.value === 'elsewhere') return t('drawer.statusElsewhere')
  return ''
})

const scopes: { value: Scope, label: string }[] = [
  { value: 'occurrence', label: 'drawer.scopeOccurrence' },
  { value: 'screen', label: 'drawer.scopeScreen' },
  { value: 'component', label: 'drawer.scopeComponent' },
]

function toggle(c: ConstraintId) {
  const cur = props.issue.intent.constraints
  engine.editIssue(props.issue.id, { constraints: cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c] })
}

function note(event: Event) {
  engine.editIssue(props.issue.id, { note: (event.target as HTMLTextAreaElement).value })
}

function attach(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const res = engine.session.attach(props.issue.id, file, file.name)
  attachError.value = res === 'type' ? t('attach.type') : res === 'size' ? t('attach.size') : ''
}

const use = computed(() => ({ preset: props.issue.intent.preset.id, params: props.issue.intent.params }))
const same = (a: { preset: string, params: Record<string, string> }) => a.preset === use.value.preset && JSON.stringify(a.params) === JSON.stringify(use.value.params)
const isFavourite = computed(() => settings.favourites.some(same))

function toggleFavourite() {
  settings.favourites = isFavourite.value
    ? settings.favourites.filter(f => !same(f))
    : [...settings.favourites, { preset: use.value.preset, params: { ...use.value.params } }].slice(-8)
}

function remove() {
  closeIssue(ui)
  engine.removeIssue(props.issue.id)
}

const rect = (r: Rect) => `${px(r.x)}, ${px(r.y)}  ${px(r.width)} x ${px(r.height)}`

/** Evidence is shown as plain text; captured strings are data. */
const evidence = computed(() => {
  const ev = props.issue.evidence
  const lines = [`A  ${rect(ev.a.bounds)}${ev.a.transformed ? `  (${t('strip.rendered')})` : ''}`]
  if (ev.b) lines.push(`B  ${rect(ev.b.bounds)}${ev.b.transformed ? `  (${t('strip.rendered')})` : ''}`)
  const rel = ev.relation
  if (rel) {
    const d = rel.delta
    lines.push(`B - A  dw ${px(d.width)}  dh ${px(d.height)}  dx ${px(d.left)}  dy ${px(d.top)}`)
    const ax = (k: 'horizontal' | 'vertical') => {
      const r = rel[k]
      return r.kind === 'touch' ? 'touch' : `${r.kind} ${px(r.distance)}`
    }
    lines.push(`h ${ax('horizontal')}  v ${ax('vertical')}${rel.diagonal ? '  diagonal' : ''}`)
  }
  lines.push(`source ${ev.a.source.quality}${ev.a.source.file ? `  ${ev.a.source.file}${ev.a.source.line ? `:${ev.a.source.line}` : ''}` : ''}${ev.a.source.component ? `  <${ev.a.source.component}>` : ''}`)
  lines.push(`viewport ${ev.capture.viewport.width} x ${ev.capture.viewport.height}  dpr ${ev.capture.devicePixelRatio}  ${ev.capture.colorScheme}`)
  return lines.join('\n')
})

// Escape goes back before it closes anything else.
onBeforeUnmount(engine.pushLayer(() => closeIssue(ui), 'view'))

// Escape can remove the view before the field reports a change; keep what was typed.
onBeforeUnmount(() => {
  const value = noteField.value?.value
  if (canEdit.value && value !== undefined && value !== props.issue.intent.note) engine.editIssue(props.issue.id, { note: value })
})
</script>

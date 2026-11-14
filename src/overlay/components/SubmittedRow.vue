<!-- src/overlay/components/SubmittedRow.vue -->
<template>
  <div
    class="row"
    :data-open="open || undefined"
  >
    <button
      type="button"
      class="line"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon :name="open ? 'chevronDown' : 'chevronRight'" />
      <span class="text">
        <span class="title">{{ t('submitted.issues', { count: batch.issues.length }) }}</span>
        <span class="sub">{{ batch.id }} {{ when }}<template v-if="shared"> - {{ t('bridge.available') }}</template></span>
      </span>
    </button>
    <div
      v-if="open"
      class="details"
    >
      <p class="dest">
        {{ t('submitted.frozen') }}
      </p>
      <div
        v-for="issue in batch.issues"
        :key="issue.id"
        class="frozen"
      >
        <div class="title">
          {{ issue.seq }}. {{ issueTitle(issue, engine.registry, t) }}
          <span
            class="state"
            :data-state="stateOf(issue.id)"
          >{{ stateText(stateOf(issue.id)) }}</span>
        </div>
        <div class="sub">
          {{ operandsText(issue, t) }}
        </div>
        <div
          v-if="live[issue.id] && live[issue.id] !== 'live'"
          class="sub warn"
        >
          {{ liveText(live[issue.id]!) }}
        </div>
        <ul
          v-if="notes(issue.id).length"
          class="notes"
        >
          <li
            v-for="f in notes(issue.id)"
            :key="f.id"
          >
            <template v-if="f.kind === 'result'">
              <span class="who">{{ t('review.agentSays') }}: {{ stateText(f.state as IssueState) }}</span>
              <span class="said">{{ f.text }}</span>
              <span
                v-if="f.files?.length"
                class="said"
              >{{ t('review.files') }}: {{ f.files.join(', ') }}</span>
              <span
                v-if="f.checks?.length"
                class="said"
              >{{ t('review.checks') }}: {{ f.checks.map(c => `${c.command} (${outcome(c.outcome)})`).join('; ') }}</span>
            </template>
            <template v-else>
              <span class="who">{{ f.kind === 'review' ? stateText(f.state as IssueState) : t('submitted.note') }}<template v-if="f.reason"> ({{ reasonText(f.reason) }})</template></span>
              <span
                v-if="f.text"
                class="said"
              >{{ f.text }}</span>
            </template>
          </li>
        </ul>
        <div class="actions review">
          <button
            type="button"
            class="key wide raised"
            :aria-pressed="stateOf(issue.id) === 'accepted'"
            @click="review(issue.id, 'accepted')"
          >
            <Icon name="check" />{{ t('review.accept') }}
          </button>
          <button
            type="button"
            class="key wide raised"
            @click="review(issue.id, 'partial')"
          >
            {{ t('review.markPartial') }}
          </button>
          <button
            type="button"
            class="key wide raised"
            :aria-expanded="reopening === issue.id"
            @click="reopening = reopening === issue.id ? null : issue.id"
          >
            {{ t('review.reopen') }}
          </button>
        </div>
        <div
          v-if="reopening === issue.id"
          class="actions review"
        >
          <button
            v-for="r in REOPEN_REASONS"
            :key="r"
            type="button"
            class="key wide raised"
            @click="review(issue.id, 'reopened', r)"
          >
            {{ reasonText(r) }}
          </button>
        </div>
        <label
          class="label"
          :for="`fol-${issue.id}`"
        >{{ t('submitted.note') }}</label>
        <textarea
          :id="`fol-${issue.id}`"
          v-model="drafts[issue.id]"
          class="field"
          :maxlength="LIMITS.note"
        />
        <div class="actions">
          <button
            type="button"
            class="key wide raised"
            :disabled="!drafts[issue.id]?.trim()"
            @click="addNote(issue.id)"
          >
            {{ t('submitted.addNote') }}
          </button>
        </div>
      </div>
      <div
        v-if="engine.bridge"
        class="actions"
      >
        <button
          v-if="!shared && ui.bridge === 'connected'"
          type="button"
          class="key wide primary"
          @click="shareBatch(rt, batch.id)"
        >
          {{ t('bridge.share') }}
        </button>
        <template v-if="shared">
          <button
            type="button"
            class="key wide raised"
            @click="copyRequest(rt, batch.id)"
          >
            <Icon name="copy" />{{ t('bridge.copyRequest') }}
          </button>
          <button
            type="button"
            class="key wide raised"
            @click="refreshResults(rt, batch.id)"
          >
            {{ t('bridge.refresh') }}
          </button>
        </template>
      </div>
      <div class="actions">
        <button
          type="button"
          class="key wide raised"
          @click="openReport(ui, { tab: 'summary', note: '', batchId: batch.id })"
        >
          <Icon name="report" />{{ t('report.title') }}
        </button>
        <button
          type="button"
          class="key wide raised"
          @click="engine.session.deleteBatch(batch.id)"
        >
          <Icon name="remove" />{{ t('submitted.delete') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Batch, FollowUp } from '../../core/model'
import { issueState, REOPEN_REASONS, type IssueState } from '../../core/review'
import type { PinStatus } from '../../dom/pins'
import { LIMITS } from '../../core/validate'
import { openReport } from '../navigate'
import { copyRequest, refreshResults, shareBatch } from '../exporting'
import { issueTitle, operandsText } from '../labels'
import { reasonText as reviewReason, reviewIssue, stateText as reviewState } from '../review'
import { useRuntime } from '../runtime'
import Icon from './Icon.vue'

const props = defineProps<{ batch: Batch }>()
const rt = useRuntime()
const { engine, sess, settings, ui, t } = rt
const open = ref(false)
const drafts = reactive<Record<string, string>>({})
const reopening = ref<string | null>(null)
const shared = computed(() => !!sess.value.shared[props.batch.id])

const stateText = (s: IssueState | undefined) => reviewState(rt, s)
const reasonText = (r: string) => reviewReason(rt, r)
const outcome = (o: string) => o === 'passed' ? t('review.passed') : o === 'failed' ? t('review.failedCheck') : t('review.notRun')
const stateOf = (issueId: string) => issueState(sess.value.followUps[props.batch.id] ?? [], issueId)

async function review(issueId: string, state: 'accepted' | 'partial' | 'reopened', reason?: FollowUp['reason']) {
  reopening.value = null
  await reviewIssue(rt, props.batch.id, issueId, state, reason ? { reason } : {})
}

const live = reactive<Record<string, PinStatus>>({})
const liveText = (s: PinStatus) => s === 'ambiguous' ? t('drawer.statusAmbiguous') : s === 'elsewhere' ? t('drawer.statusElsewhere') : t('drawer.statusUnavailable')

// Agent results arrive through the bridge; fetch them when the batch is opened. The live target is checked then too.
watch(open, (now) => {
  if (!now) return
  for (const i of props.batch.issues) live[i.id] = engine.locate(i)
  if (shared.value) void refreshResults(rt, props.batch.id)
})

const when = computed(() => {
  const at = props.batch.submittedAt
  if (!at) return ''
  try {
    return new Intl.DateTimeFormat(settings.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(at))
  }
  catch {
    return at
  }
})

function notes(issueId: string) {
  return (sess.value.followUps[props.batch.id] ?? []).filter(f => f.issueId === issueId)
}

async function addNote(issueId: string) {
  const text = drafts[issueId] ?? ''
  const res = await engine.session.addFollowUp({ batchId: props.batch.id, issueId, kind: 'note', actor: 'human', text })
  if (res.result !== 'added') return
  drafts[issueId] = ''
  if (res.followUp && shared.value) await engine.bridge?.addFollowUp(res.followUp)
}
</script>

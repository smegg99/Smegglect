<!-- src/overlay/components/IssueView.vue -->
<template>
  <!-- Part of the tab it was opened from. -->
  <div
    id="sg-tabpanel"
    class="body issue-view"
    role="tabpanel"
    :aria-labelledby="`sg-tab-${ui.back}`"
    @paste="onPaste"
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
        :accept="ATTACHMENT_TYPES.join(',')"
        :aria-label="t('attach.add')"
        @change="attach"
      >
    </header>
    <p class="says">
      {{ sentence }}
    </p>
    <p
      v-if="status && status !== 'live'"
      class="notice"
    >
      <span class="warn">{{ statusLine }}</span>
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
    <label class="check">
      <input
        type="checkbox"
        :checked="issue.intent.scope === 'component'"
        :disabled="!canEdit"
        @change="engine.editIssue(issue.id, {
          scope: ($event.target as HTMLInputElement).checked ? 'component' : 'occurrence'
        })"
      >{{ t('compose.everywhere') }}
    </label>
    <p
      v-if="canEdit && !files.length"
      class="dest paste-hint"
    >
      {{ t('attach.pasteHint') }}
    </p>
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
          <span :class="{ warn: a.review === 'pending' }">{{
            a.review === 'approved' ? t('attach.approved') : t('attach.pending')
          }}</span>
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
      {{ t('card.captured', { when }) }} - {{
        pageLabel(issue.evidence.capture.location, issue.evidence.capture.screen)
      }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ATTACHMENT_TYPES } from '../../core/attachments'
import { compare } from '../../core/compare'
import type { Issue } from '../../core/model'
import { editable } from '../../core/presets'
import { intentSentence } from '../../core/task'
import { LIMITS } from '../../core/limits'
import type { AttachResult } from '../../dom/session'
import { evidenceText } from '../evidence-text'
import { pastedImages, pastedName } from '../paste'
import { describe, issueTitle, pageLabel, shortTime, statusText, subjectOf } from '../labels'
import { closeIssue } from '../navigate'
import { useRuntime } from '../runtime'
import type { PresetUse } from '../settings'
import Comparison from './Comparison.vue'
import Icon from './Icon.vue'
import Key from './Key.vue'

const props = defineProps<{ issue: Issue }>()
const { engine, geo, sess, settings, ui, t } = useRuntime()
const picker = ref<HTMLInputElement | null>(null)
const noteField = ref<HTMLTextAreaElement | null>(null)
const attachError = ref('')

const def = computed(() => engine.registry.byId.get(props.issue.intent.preset.id))
const canEdit = computed(() => props.issue.status === 'draft'
  && editable(engine.registry, props.issue.intent.preset))
const title = computed(() => issueTitle(props.issue, engine.registry, t))
const sentence = computed(() => describe(subjectOf(props.issue, t), engine.registry, t))
const task = computed(() => intentSentence(props.issue, engine.registry))
const files = computed(() => {
  return sess.value.attachments.filter(attachment => attachment.issueId === props.issue.id)
})
const status = computed(() => geo.value.pins.find(pin => pin.id === props.issue.id)?.status)
const table = computed(() => {
  const { evidence, intent } = props.issue
  const comparison = compare(def.value, intent.params, evidence.a, evidence.b)
  return comparison && comparison.rows.length ? comparison : null
})
const when = computed(() => shortTime(props.issue.createdAt, settings.locale))
const statusLine = computed(() => statusText(status.value, t))

function note(event: Event) {
  engine.editIssue(props.issue.id, { note: (event.target as HTMLTextAreaElement).value })
}

function attach(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  attachFile(file, file.name)
}

function attachFile(file: File, name: string) {
  attachError.value = attachErrorText(engine.session.attach(props.issue.id, file, name))
}

/** Ctrl+V with an image on the clipboard attaches it to a draft issue; text pastes as usual. */
function onPaste(event: ClipboardEvent) {
  const images = pastedImages(event)
  if (!images.length || !canEdit.value) return
  event.preventDefault()
  for (const image of images) attachFile(image, pastedName(image))
}

/** Why an image was refused, in words; nothing when it was attached. */
function attachErrorText(result: AttachResult): string {
  if (result === 'type') return t('attach.type')
  if (result === 'size') return t('attach.size')
  return ''
}

const use = computed<PresetUse>(() => {
  const { preset, params } = props.issue.intent
  return { preset: preset.id, params }
})
/** The same preset and choice; choices are plain strings in one key order, so equal ones print alike. */
const sameUse = (other: PresetUse) => other.preset === use.value.preset
  && JSON.stringify(other.params) === JSON.stringify(use.value.params)
const isFavourite = computed(() => settings.favourites.some(sameUse))

function toggleFavourite() {
  if (isFavourite.value) {
    settings.favourites = settings.favourites.filter(favourite => !sameUse(favourite))
    return
  }
  const added = { preset: use.value.preset, params: { ...use.value.params } }
  settings.favourites = [...settings.favourites, added].slice(-8)
}

function remove() {
  closeIssue(ui)
  engine.removeIssue(props.issue.id)
}

/** Evidence is shown as plain text; captured strings are data. */
const evidence = computed(() => evidenceText(props.issue.evidence, t('strip.rendered')))

// Escape goes back before it closes anything else.
onBeforeUnmount(engine.pushLayer(() => closeIssue(ui), 'view'))

// Escape can remove the view before the field reports a change; keep what was typed.
onBeforeUnmount(() => {
  const value = noteField.value?.value
  if (canEdit.value && value !== undefined
    && value !== props.issue.intent.note) engine.editIssue(props.issue.id, { note: value })
})
</script>

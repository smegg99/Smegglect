<!-- src/overlay/components/Compose.vue -->
<template>
  <section
    v-if="composing?.b || comparison"
    class="reference"
  >
    <p
      v-if="composing?.b"
      class="b-line"
    >
      <span class="tag b">B</span><span class="name">{{ composing.b.chip }}</span>
    </p>
    <Comparison
      v-if="comparison"
      :data="comparison"
    />
  </section>
  <Actions
    :kind="kind"
    :selected="chosen"
    @choose="choose"
  />
  <section
    class="compose"
    :aria-label="t('compose.title')"
    @keydown.enter.ctrl.prevent="add"
    @keydown.enter.meta.prevent="add"
  >
    <p class="kind-line">
      <span class="label">{{ t('compose.type') }}</span>
      <Icon :name="current?.icon ?? 'note'" /><span class="kind">{{ currentLabel }}</span><span
        v-if="spaceText"
        class="space"
      >{{ spaceText }}</span>
    </p>
    <textarea
      v-model="note"
      class="field"
      :maxlength="LIMITS.note"
      :aria-label="t('compose.whatsWrong')"
      :placeholder="t('compose.whatsWrong')"
      @paste="onPaste"
    />
    <p
      v-if="images.length"
      class="pasted"
      role="status"
    >
      <span>{{ t('compose.images', { count: images.length }) }}</span>
      <button
        type="button"
        class="link"
        @click="images = []"
      >
        {{ t('compose.imagesClear') }}
      </button>
    </p>
    <label class="check">
      <input
        v-model="everywhere"
        type="checkbox"
      >{{ t('compose.everywhere') }}
    </label>
    <p
      v-if="existing"
      class="notice"
      role="status"
    >
      {{ t('compose.exists', { number: existing.seq }) }}
      <button
        type="button"
        class="link"
        @click="openIssue(ui, existing.id)"
      >
        {{ t('compose.open', { number: existing.seq }) }}
      </button>
    </p>
    <button
      type="button"
      class="key wide primary add"
      :disabled="!ready"
      @click="add"
      @pointerenter="showTip(ui, $event.currentTarget as Element, t('compose.add'), 'above', 'Ctrl+Enter')"
      @pointerleave="hideTip(ui, t('compose.add'))"
    >
      {{ t('compose.add') }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { px } from '../../core/geometry'
import type { Issue, TargetKind } from '../../core/model'
import type { PresetDef } from '../../core/presets'
import { LIMITS } from '../../core/limits'
import { presetLabel } from '../labels'
import { openIssue } from '../navigate'
import { pastedImages, pastedName } from '../paste'
import { useRuntime } from '../runtime'
import { hideTip, showTip } from '../tip'
import Actions from './Actions.vue'
import Comparison from './Comparison.vue'
import Icon from './Icon.vue'

const props = defineProps<{ kind: TargetKind }>()
const { engine, state, ui, t } = useRuntime()

const NOTE = { preset: 'note', params: {} as Record<string, string> }
const def = (id: string) => engine.registry.byId.get(id)

const current = computed(() => def(chosen.value.preset))
const currentLabel = computed(() => presetLabel(current.value, chosen.value.preset, t))

/** A second element (B) or a group anchor is chosen on the page before the issue can be added. */
const stepFirst = (definition: PresetDef) => definition.operands === 'reference'
  || (definition.operands === 'compare' && props.kind !== 'group')
  || definition.id === 'group-align'
/**
 * Types that compare two things start at once, so their comparison shows before Add; the rest start on
 * Add.
 */
const startsAtOnce = (definition: PresetDef) => stepFirst(definition) || definition.operands === 'compare'

/**
 * What the form held before the page reloaded (keep.ts). A type that is chosen on the page first comes back
 * as a plain note: the click it waited for is gone with the page.
 */
const kept = ui.draft
const keptDef = kept ? def(kept.preset) : undefined
const note = ref(kept?.note ?? '')
const everywhere = ref(kept?.everywhere ?? false)
/** The type picked in the tree; a plain note until another is picked. */
const restorable = kept && keptDef && !startsAtOnce(keptDef)
const chosen = ref(restorable ? { preset: kept.preset, params: kept.params } : NOTE)
watch([note, everywhere, chosen], () => {
  const { preset, params } = chosen.value
  ui.draft = { preset, params: { ...params }, note: note.value, everywhere: everywhere.value }
})

const composing = computed(() => state.value.composing)
const comparison = computed(() => composing.value?.comparison && composing.value.comparison.rows.length
  ? composing.value.comparison
  : null)
/** The draft that already says exactly this, after an add was refused for it. */
const existing = ref<Issue | null>(null)
watch(note, () => (existing.value = null))
const ready = computed(() => {
  const definition = current.value
  if (!definition || existing.value) return false
  if (startsAtOnce(definition) && composing.value?.preset !== definition.id) return false
  return definition.note !== 'required' || note.value.trim().length > 0
})

/** The space picked while measuring, which a Spacing issue names: `padding-top 16 px`. */
const picked = computed(() => state.value.space)
const spaceText = computed(() => {
  const space = picked.value
  return space && chosen.value.preset === 'spacing' ? `${space.name} ${px(space.size)}` : ''
})
// A picked space is reported as Spacing; the note says whether there is too much or too little.
watch(picked, (space) => {
  if (space) chosen.value = { preset: 'spacing', params: {} }
}, { immediate: true })

/** A Spacing issue on a picked space carries its name; other types and plain picks do not. */
function paramsFor(preset: string, params: Record<string, string>): Record<string, string> {
  const space = picked.value
  return preset === 'spacing' && space ? { ...params, space: space.name } : params
}

/** Images pasted while writing; they are attached to the issue when it is added. */
const images = ref<File[]>([])
watch(() => state.value.selected, () => (images.value = []))

/** Ctrl+V with an image on the clipboard holds it for the issue; text pastes into the note as usual. */
function onPaste(event: ClipboardEvent) {
  const pasted = pastedImages(event)
  if (!pasted.length) return
  event.preventDefault()
  images.value = [...images.value, ...pasted]
}

/** Attaches the held images to the issue just added: the newest draft. */
function attachHeld() {
  const added = state.value.drafts.issues.at(-1)
  if (added) for (const image of images.value) engine.session.attach(added.id, image, pastedName(image))
  images.value = []
}

/** Picking the type that is already picked goes back to a plain note. */
function choose(id: string, params: Record<string, string> = {}) {
  const again = chosen.value.preset === id && JSON.stringify(chosen.value.params) === JSON.stringify(params)
  existing.value = null
  engine.cancelCompose()
  chosen.value = again ? NOTE : { preset: id, params }
  const definition = current.value
  if (!again && definition && startsAtOnce(definition)) engine.begin(id, paramsFor(id, params))
}

// Leaving the step on the page (Escape, Cancel) without choosing goes back to a plain note.
watch(() => [state.value.inspect.mode.kind, composing.value] as const, ([mode, stillComposing]) => {
  const definition = current.value
  if (mode === 'pass' && !stillComposing && definition && stepFirst(definition)) chosen.value = NOTE
})

async function add() {
  if (!ready.value) return
  const { preset } = chosen.value
  const params = paramsFor(preset, chosen.value.params)
  if (composing.value?.preset !== preset && engine.begin(preset, params) !== 'composing') return
  const result = await engine.commit({
    note: note.value,
    scope: everywhere.value ? 'component' : 'occurrence',
  })
  if (result === 'exists') existing.value = engine.issuesOnSelection()
    .find(issue => issue.intent.preset.id === preset && issue.intent.note === note.value.trim())
    ?? null
  if (result !== 'added') return
  attachHeld()
  note.value = ''
  everywhere.value = false
  chosen.value = NOTE
}
</script>

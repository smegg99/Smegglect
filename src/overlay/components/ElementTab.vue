<!-- src/overlay/components/ElementTab.vue -->
<template>
  <div
    id="sg-tabpanel"
    ref="body"
    class="body element"
    role="tabpanel"
    aria-labelledby="sg-tab-element"
  >
    <EmptyState
      v-if="!info"
      icon="pick"
      :title="t('inspector.nothingSelected')"
      :text="t('inspector.empty')"
    >
      <button
        type="button"
        class="tile"
        @click="engine.togglePick()"
      >
        <Icon name="pick" /><span class="label">{{ t('dock.pick') }}</span><kbd>Alt+Shift+P</kbd>
      </button>
      <button
        type="button"
        class="tile"
        @click="engine.toggleRegion()"
      >
        <Icon name="region" /><span class="label">{{ t('dock.region') }}</span><kbd>Alt+Shift+R</kbd>
      </button>
      <button
        type="button"
        class="tile"
        @click="toggleGroup"
      >
        <Icon name="group" /><span class="label">{{ t('inspector.several') }}</span><kbd>Shift</kbd>
      </button>
    </EmptyState>
    <template v-else>
      <section class="target">
        <div class="target-row">
          <div class="chip">
            <span
              class="name"
              :title="chip"
            >{{ chip }}</span>
            <span class="dims">{{ dims }}</span>
          </div>
          <Key
            v-if="info.canEscalate"
            icon="parent"
            :label="t('strip.parent')"
            tip-side="below"
            @click="engine.escalate()"
          />
          <Key
            v-if="info.kind !== 'region'"
            icon="group"
            :label="t('strip.group')"
            :pressed="state.extend"
            tip-side="below"
            @click="toggleGroup"
          />
          <Key
            icon="close"
            :label="t('inspector.clear')"
            tip-side="below"
            @click="engine.clear()"
          />
        </div>
        <Tree
          v-if="info.kind === 'group'"
          name="members"
          :label="t('inspector.members')"
          :nodes="memberNodes"
          @hover="node => (ui.member = node ? memberIndex(node) : null)"
          @remove="dropMember"
        />
        <p
          v-if="info.boundary"
          class="notice"
          role="status"
        >
          <span class="warn">{{ boundaryText }}</span>
          <button
            type="button"
            class="link"
            @click="engine.toggleRegion()"
          >
            {{ t('inspector.drawInstead') }}
          </button>
        </p>
      </section>
      <section
        v-if="here.length"
        class="here"
      >
        <h3 class="section">
          {{ t('inspector.here') }}
        </h3>
        <button
          v-for="issue in here"
          :key="issue.id"
          type="button"
          class="here-line"
          @click="openIssue(ui, issue.id)"
        >
          <span class="num">{{ issue.seq }}</span>{{ issueTitle(issue, engine.registry, t) }}
        </button>
      </section>
      <Readout />
      <Compose :kind="info.kind" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { px } from '../../core/geometry'
import { issueTitle } from '../labels'
import { openIssue } from '../navigate'
import { useRuntime } from '../runtime'
import Compose from './Compose.vue'
import EmptyState from './EmptyState.vue'
import Key from './Key.vue'
import Tree, { type TreeNode } from './Tree.vue'
import Readout from './Readout.vue'
import Icon from './Icon.vue'

const { engine, state, geo, ui, t } = useRuntime()
const body = ref<HTMLElement | null>(null)

const info = computed(() => state.value.selected)

const chip = computed(() => {
  const selected = info.value
  if (!selected) return ''
  if (selected.kind === 'region') return t('strip.region')
  if (selected.kind === 'group') return t('strip.elements', { count: selected.descriptors.length })
  return selected.chips[0] ?? ''
})

const dims = computed(() => {
  const a = geo.value.a
  if (!a) return ''
  const size = `${px(a.width)} x ${px(a.height)}`
  const contents = info.value?.contents
  if (!contents) return size
  const key = contents.mode === 'inside' ? 'inspector.elementsInside' : 'inspector.elementsTouching'
  return `${size}, ${t(key, { count: contents.count })}`
})

const boundaryText = computed(() => {
  const boundary = info.value?.boundary
  if (boundary === 'canvas') return t('strip.canvas')
  if (boundary === 'iframe') return t('strip.iframe')
  return t('strip.closedRoot')
})

/** Issues already reported on this selection, so the same thing is not reported twice. */
const here = computed(() => {
  void state.value.drafts
  return engine.issuesOnSelection()
})

/**
 * A group's members as tree rows, each with its rendered size and an X; hovering one marks it on the
 * page.
 */
const memberNodes = computed<TreeNode[]>(() => {
  const selected = info.value
  if (selected?.kind !== 'group') return []
  const remove = t('inspector.removeMember')
  return [{
    id: 'members',
    label: t('inspector.members'),
    children: selected.chips.map((chip, i) => {
      const rect = geo.value.members[i]
      return {
        id: `member:${i}`,
        label: chip,
        icon: 'pick',
        quiet: true,
        remove,
        ...(rect ? { meta: `${px(rect.width)} x ${px(rect.height)}` } : {}),
      }
    }),
  }]
})

const memberIndex = (node: TreeNode) => Number(node.id.slice('member:'.length))

/** Takes a member out of the group; when one is left the list goes, so focus moves to the actions. */
async function dropMember(node: TreeNode) {
  const last = info.value?.kind === 'group' && info.value.chips.length <= 2
  ui.member = null
  engine.drop(memberIndex(node))
  if (!last) return
  await nextTick()
  body.value?.querySelector<HTMLElement>('.compose textarea')?.focus()
}

/** Building a group means picking, so switching it on also turns picking on. */
function toggleGroup() {
  const on = !state.value.extend
  engine.setExtend(on)
  if (on && state.value.inspect.mode.kind !== 'pick') engine.togglePick()
}


</script>

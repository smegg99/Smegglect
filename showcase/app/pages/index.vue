<!-- showcase/app/pages/index.vue -->
<template>
  <div class="tab">
    <header class="head">
      <h1 class="trip">
        Weekend in the Tatras with everyone from the climbing club
      </h1>
      <span class="beta">BETA</span>
    </header>

    <div class="people">
      <v-chip
        v-for="(person, index) in people"
        :key="person"
        :style="{ marginRight: CHIP_GAPS[index % CHIP_GAPS.length] }"
      >
        {{ person }}
      </v-chip>
    </div>

    <div class="columns">
      <v-card class="expenses">
        <v-card-title>Expenses</v-card-title>
        <ul class="list">
          <li
            v-for="expense in expenses"
            :key="expense.id"
          >
            <span class="what">{{ expense.title }}</span>
            <span class="who">{{ expense.paidBy }}</span>
            <span class="amount">{{ money(expense.amount) }}</span>
            <button
              type="button"
              class="drop"
              :aria-label="`Remove ${expense.title}`"
              @click="remove(expense.id)"
            >
              <v-icon
                icon="mdi-close"
                size="10"
              />
            </button>
          </li>
        </ul>
        <form
          class="add"
          @submit.prevent="submit"
        >
          <v-text-field
            v-model="title"
            label="What"
            density="compact"
            hide-details
          />
          <v-text-field
            v-model.number="amount"
            label="Amount"
            type="number"
            density="compact"
            hide-details
          />
          <v-select
            v-model="paidBy"
            :items="people"
            label="Paid by"
            density="compact"
            hide-details
          />
          <v-btn
            type="submit"
            class="add-button"
            :disabled="!title || !amount"
          >
            Add
          </v-btn>
        </form>
        <p class="total">
          Total {{ money(total) }}
        </p>
      </v-card>

      <div class="side">
        <v-card class="balances">
          <v-card-title>Who owes whom</v-card-title>
          <p
            v-for="transfer in transfers"
            :key="`${transfer.from}-${transfer.to}`"
            class="transfer"
          >
            {{ transfer.from }} pays {{ transfer.to }} {{ money(transfer.amount) }}
          </p>
          <v-btn
            class="settle"
            color="primary"
          >
            Settle up
          </v-btn>
        </v-card>

        <v-card class="options">
          <v-card-title>Options</v-card-title>
          <v-select
            v-model="currency"
            :items="CURRENCIES"
            label="Currency"
            density="compact"
          />
          <v-switch
            v-model="rounded"
            label="Round to whole numbers"
            hide-details
          />
        </v-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CURRENCIES, useTab } from '~/composables/useTab'

const { people, expenses, currency, rounded, total, transfers, add, remove, money } = useTab()

const CHIP_GAPS = ['2px', '16px', '5px', '0']

const title = ref('')
const amount = ref<number | null>(null)
const paidBy = ref(people.value[0] ?? '')

function submit() {
  if (!title.value || !amount.value) return
  add(title.value, amount.value, paidBy.value)
  title.value = ''
  amount.value = null
}
</script>

<style scoped>
/* The showcase starts with a poor UI on purpose: report what is wrong with Smegglect and let Claude fix it. */
.tab { max-width: 1040px; margin: 0 auto; padding: 32px 24px; }

.head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.trip { width: 300px; margin: 0; overflow: hidden; font-size: 24px; text-overflow: ellipsis; white-space: nowrap; }
.beta { padding: 2px 6px; border-radius: 4px; background: #ff1744; color: #fff; font-size: 10px; animation: blink 0.6s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }

.people { display: flex; margin-bottom: 24px; }

.columns { display: grid; grid-template-columns: 3fr 2fr; gap: 24px; align-items: start; }
.side { display: grid; gap: 24px; }

.expenses { padding: 0 2px; }
.list { margin: 0; padding: 0; list-style: none; }
.list li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
.what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who { width: 72px; color: rgba(var(--v-theme-on-surface), 0.6); }
.amount { width: 96px; font-family: serif; }
.drop { display: grid; width: 14px; height: 14px; place-items: center; border-radius: 2px; }

.add { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; margin-top: 12px; }
.add-button { margin-top: 9px; }
.total { margin: 12px 0 8px; font-weight: 600; }

.balances { padding-bottom: 16px; }
.transfer { margin: 0 16px 6px; color: rgba(var(--v-theme-on-surface), 0.28); }
.settle { width: 220px; height: 64px !important; margin: 8px 16px 0; border-radius: 50%; }

.options { padding: 0 16px 8px; }
</style>

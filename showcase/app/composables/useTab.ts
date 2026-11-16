// showcase/app/composables/useTab.ts
// The shared tab: who is in, what each paid, and the fewest payments that settle it. Kept in memory; a reload
// starts the sample trip again.

import { computed, ref } from 'vue'

export interface Expense {
  id: number
  title: string
  /** In cents. */
  amount: number
  paidBy: string
}

export interface Transfer {
  from: string
  to: string
  amount: number
}

export type Currency = 'EUR' | 'USD' | 'PLN'
export const CURRENCIES: readonly Currency[] = ['EUR', 'USD', 'PLN']

const people = ref(['Ada', 'Grace', 'Linus', 'Margaret'])
const expenses = ref<Expense[]>([
  { id: 1, title: 'Cabin for two nights, with the late check-out fee', amount: 48000, paidBy: 'Ada' },
  { id: 2, title: 'Groceries', amount: 9240, paidBy: 'Grace' },
  { id: 3, title: 'Fuel', amount: 6150, paidBy: 'Linus' },
  { id: 4, title: 'Cable car tickets', amount: 11200, paidBy: 'Margaret' },
])
const currency = ref<Currency>('EUR')
const rounded = ref(false)
let nextId = expenses.value.length + 1

/** Who still owes and who is owed, matched largest first: at most one payment fewer than there are people. */
function settle(balances: { name: string, balance: number }[]): Transfer[] {
  const owing = balances.filter(entry => entry.balance < 0).map(entry => ({ ...entry, balance: -entry.balance }))
  const owed = balances.filter(entry => entry.balance > 0).map(entry => ({ ...entry }))
  const transfers: Transfer[] = []
  owing.sort((a, b) => b.balance - a.balance)
  owed.sort((a, b) => b.balance - a.balance)
  for (const debtor of owing) {
    for (const creditor of owed) {
      const amount = Math.min(debtor.balance, creditor.balance)
      if (amount < 1) continue
      transfers.push({ from: debtor.name, to: creditor.name, amount })
      debtor.balance -= amount
      creditor.balance -= amount
    }
  }
  return transfers
}

export function useTab() {
  const total = computed(() => expenses.value.reduce((sum, expense) => sum + expense.amount, 0))
  const balances = computed(() => {
    const share = total.value / people.value.length
    return people.value.map((name) => {
      const paid = expenses.value.filter(expense => expense.paidBy === name)
        .reduce((sum, expense) => sum + expense.amount, 0)
      return { name, balance: Math.round(paid - share) }
    })
  })
  const transfers = computed(() => settle(balances.value))

  function add(title: string, amount: number, paidBy: string) {
    expenses.value.push({ id: nextId++, title, amount: Math.round(amount * 100), paidBy })
  }

  function remove(id: number) {
    expenses.value = expenses.value.filter(expense => expense.id !== id)
  }

  function money(cents: number): string {
    const digits = rounded.value ? 0 : 2
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.value,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(cents / 100)
  }

  return { people, expenses, currency, rounded, total, transfers, add, remove, money }
}

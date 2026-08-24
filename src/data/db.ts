import Dexie, { type Table } from 'dexie'

export type TransactionType = 'expense' | 'income'
export type RecurringFrequency = 'weekly' | 'monthly'

export interface Category {
  id: string
  name: string
  color: string
  type: TransactionType
  isDefault: boolean
  deletedAt?: number
  updatedAt: number
}

export interface Transaction {
  id: string
  type: TransactionType
  categoryId: string
  amount: number
  description: string
  date: string // YYYY-MM-DD
  time: string // HH:mm
  recurringRuleId?: string
  createdAt: number
  updatedAt: number
}

export interface Budget {
  id: string
  categoryId: string
  month: string // YYYY-MM
  limitAmount: number
  updatedAt: number
}

export interface RecurringRule {
  id: string
  categoryId: string
  amount: number
  description: string
  type: TransactionType
  frequency: RecurringFrequency
  dayOfMonth?: number // 1-31, used when frequency = 'monthly'
  dayOfWeek?: number // 0-6 (Sun-Sat), used when frequency = 'weekly'
  isActive: boolean
  startDate: string // YYYY-MM-DD, occurrences are only counted after this date
  lastPostedDate?: string // YYYY-MM-DD, last date an occurrence was auto-posted through
  updatedAt: number
}

class BudgetDatabase extends Dexie {
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  budgets!: Table<Budget, string>
  recurringRules!: Table<RecurringRule, string>

  constructor() {
    super('budget-manager')
    this.version(1).stores({
      categories: 'id, type',
      transactions: 'id, categoryId, date, recurringRuleId',
      budgets: 'id, categoryId, month, [categoryId+month]',
      recurringRules: 'id, categoryId',
    })
  }
}

export const db = new BudgetDatabase()

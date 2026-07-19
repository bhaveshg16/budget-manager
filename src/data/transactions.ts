import { db } from './db'
import type { Transaction, TransactionType } from './db'
import { makeId } from '../utils/id'

export interface NewTransactionInput {
  type: TransactionType
  categoryId: string
  amount: number
  description: string
  date: string
  time: string
  recurringRuleId?: string
}

export async function createTransaction(input: NewTransactionInput): Promise<Transaction> {
  const now = Date.now()
  const transaction: Transaction = { ...input, id: makeId(), createdAt: now, updatedAt: now }
  await db.transactions.add(transaction)
  return transaction
}

export async function updateTransaction(id: string, changes: Partial<NewTransactionInput>): Promise<void> {
  await db.transactions.update(id, { ...changes, updatedAt: Date.now() })
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id)
}

export async function listTransactionsForMonth(month: string): Promise<Transaction[]> {
  return db.transactions.where('date').startsWith(month).toArray()
}

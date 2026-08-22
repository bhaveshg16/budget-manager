import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { currentMonthString } from '../utils/date'
import { AnalyticsScreen } from './AnalyticsScreen'

function previousMonthString(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

describe('AnalyticsScreen comparison builder', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.transactions.clear()
    await db.budgets.clear()
    localStorage.clear()
  })

  it('renders the comparison builder with month and category chips', async () => {
    const month = currentMonthString()
    await db.categories.add({ id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 })
    await db.transactions.add({ id: 't1', type: 'expense', categoryId: 'c1', amount: 10, description: '', date: `${month}-05`, time: '09:00', createdAt: 1, updatedAt: 1 })
    render(<AnalyticsScreen />)
    expect(await screen.findByText('Compare')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: month, pressed: true })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Food', pressed: true })).toBeInTheDocument()
  })

  it('persists chip selection to localStorage', async () => {
    const month = currentMonthString()
    await db.categories.add({ id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 })
    await db.transactions.add({ id: 't1', type: 'expense', categoryId: 'c1', amount: 10, description: '', date: `${month}-05`, time: '09:00', createdAt: 1, updatedAt: 1 })
    render(<AnalyticsScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Food', pressed: true }))
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('budget-manager:compareSelection')!).excludedCategoryIds).toContain('c1')
    })
  })

  it('shows per-month amounts with a delta column and drops excluded categories', async () => {
    const month = currentMonthString()
    const prevMonth = previousMonthString(month)
    await db.categories.bulkAdd([
      { id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 },
      { id: 'c2', name: 'Rent', color: '#ef4444', type: 'expense', isDefault: true, updatedAt: 1 },
    ])
    await db.transactions.bulkAdd([
      { id: 't1', type: 'expense', categoryId: 'c1', amount: 10, description: '', date: `${prevMonth}-05`, time: '09:00', createdAt: 1, updatedAt: 1 },
      { id: 't2', type: 'expense', categoryId: 'c1', amount: 25, description: '', date: `${month}-05`, time: '09:00', createdAt: 1, updatedAt: 1 },
      { id: 't3', type: 'expense', categoryId: 'c2', amount: 99, description: '', date: `${month}-06`, time: '09:00', createdAt: 1, updatedAt: 1 },
    ])
    render(<AnalyticsScreen />)

    // Default selection is 2 months (previous + current), so the delta column appears.
    expect(await screen.findByRole('columnheader', { name: 'Δ' })).toBeInTheDocument()
    const foodRow = (await screen.findByRole('cell', { name: 'Food' })).closest('tr')!
    expect(foodRow).toHaveTextContent('₹10')
    expect(foodRow).toHaveTextContent('₹25')
    expect(foodRow).toHaveTextContent('₹15') // delta = 25 - 10
    const rentRow = screen.getByRole('cell', { name: 'Rent' }).closest('tr')!
    expect(rentRow).toHaveTextContent('₹0') // absent month treated as 0
    expect(rentRow).toHaveTextContent('₹99')

    // Excluding a category removes its row.
    await userEvent.click(screen.getByRole('button', { name: 'Rent', pressed: true }))
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Rent' })).not.toBeInTheDocument())
    expect(screen.getByRole('cell', { name: 'Food' })).toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../data/db'
import { createCategory } from '../data/categories'
import { setBudgetLimit } from '../data/budgets'
import { createRecurringRule } from '../data/recurring'
import { currentMonthString } from '../utils/date'
import { CategoriesBudgetsScreen } from './CategoriesBudgetsScreen'

describe('CategoriesBudgetsScreen', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.budgets.clear()
    await db.recurringRules.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets a monthly budget limit for a category', async () => {
    const category = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    render(<CategoriesBudgetsScreen />)

    const input = await screen.findByLabelText(category.name) // exact match: the budget input only
    await userEvent.clear(input)
    await userEvent.type(input, '8000')
    await userEvent.tab() // blur to trigger save

    const budgets = await db.budgets.where('month').equals(currentMonthString()).toArray()
    expect(budgets).toHaveLength(1)
    expect(budgets[0].limitAmount).toBe(8000)
  })

  it('does not overwrite an existing budget limit when the input is cleared and blurred', async () => {
    const category = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await setBudgetLimit(category.id, currentMonthString(), 5000)
    render(<CategoriesBudgetsScreen />)

    const input = await screen.findByLabelText(category.name) // exact match: the budget input only
    await userEvent.clear(input)
    await userEvent.tab() // blur with a blank input should not save

    const budgets = await db.budgets.where('month').equals(currentMonthString()).toArray()
    expect(budgets).toHaveLength(1)
    expect(budgets[0].limitAmount).toBe(5000)
  })

  it('adds a new category', async () => {
    render(<CategoriesBudgetsScreen />)
    await screen.findByText('Monthly Budgets')
    await userEvent.type(screen.getByLabelText(/new category name/i), 'Pets')
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    expect(await screen.findByDisplayValue('Pets')).toBeInTheDocument()
    const stored = await db.categories.toArray()
    expect(stored.some((c) => c.name === 'Pets' && !c.isDefault)).toBe(true)
  })

  it('deletes a category after confirmation and hides it from budgets', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await db.categories.add({ id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 })
    render(<CategoriesBudgetsScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /delete food/i }))
    await waitFor(async () => expect((await db.categories.get('c1'))?.deletedAt).toBeGreaterThan(0))
    await waitFor(() => expect(screen.queryByLabelText('Food')).not.toBeInTheDocument())
  })

  it('does not delete a category when confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await db.categories.add({ id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 })
    render(<CategoriesBudgetsScreen />)
    await userEvent.click(await screen.findByRole('button', { name: /delete food/i }))
    expect(window.confirm).toHaveBeenCalled()
    expect((await db.categories.get('c1'))?.deletedAt).toBeUndefined()
    expect(screen.getByLabelText('Food')).toBeInTheDocument()
  })

  it('renames a category on blur', async () => {
    await db.categories.add({ id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 })
    render(<CategoriesBudgetsScreen />)
    const nameInput = await screen.findByLabelText(/rename food/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Eating out')
    await userEvent.tab()
    await waitFor(async () => expect((await db.categories.get('c1'))?.name).toBe('Eating out'))
  })

  it('lists active recurring entries and stops one after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const rent = await createCategory({ name: 'Rent', color: '#ef4444', type: 'expense' })
    const rule = await createRecurringRule({
      categoryId: rent.id, amount: 15000, description: 'Flat rent', type: 'expense',
      frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-05',
    })
    render(<CategoriesBudgetsScreen />)

    expect(await screen.findByText('Flat rent')).toBeInTheDocument()
    expect(screen.getByText(/monthly on day 5/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /stop flat rent/i }))

    await waitFor(async () => expect((await db.recurringRules.get(rule.id))?.isActive).toBe(false))
    await waitFor(() => expect(screen.queryByText('Flat rent')).not.toBeInTheDocument())
  })

  it('keeps a recurring entry when stopping is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const rule = await createRecurringRule({
      categoryId: 'c1', amount: 99, description: 'Gym', type: 'expense',
      frequency: 'weekly', dayOfWeek: 1, startDate: '2026-01-05',
    })
    render(<CategoriesBudgetsScreen />)

    expect(await screen.findByText(/weekly on mon/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /stop gym/i }))
    expect((await db.recurringRules.get(rule.id))?.isActive).toBe(true)
  })

  it('shows an empty state when nothing is recurring', async () => {
    render(<CategoriesBudgetsScreen />)
    expect(await screen.findByText(/no recurring entries/i)).toBeInTheDocument()
  })
})

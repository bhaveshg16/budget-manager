import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { createCategory } from '../data/categories'
import { setBudgetLimit } from '../data/budgets'
import { currentMonthString } from '../utils/date'
import { CategoriesBudgetsScreen } from './CategoriesBudgetsScreen'

describe('CategoriesBudgetsScreen', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.budgets.clear()
  })

  it('sets a monthly budget limit for a category', async () => {
    const category = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    render(<CategoriesBudgetsScreen />)

    const input = await screen.findByLabelText(new RegExp(category.name, 'i'))
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

    const input = await screen.findByLabelText(new RegExp(category.name, 'i'))
    await userEvent.clear(input)
    await userEvent.tab() // blur with a blank input should not save

    const budgets = await db.budgets.where('month').equals(currentMonthString()).toArray()
    expect(budgets).toHaveLength(1)
    expect(budgets[0].limitAmount).toBe(5000)
  })
})

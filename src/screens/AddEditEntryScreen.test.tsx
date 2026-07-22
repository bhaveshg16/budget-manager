import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { createCategory } from '../data/categories'
import { AddEditEntryScreen } from './AddEditEntryScreen'

describe('AddEditEntryScreen', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('creates a transaction from the form', async () => {
    await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    render(<MemoryRouter initialEntries={['/entry/new']}><AddEditEntryScreen /></MemoryRouter>)

    await userEvent.type(await screen.findByLabelText(/amount/i), '199')
    await userEvent.type(screen.getByLabelText(/description/i), 'Coffee')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    const saved = await db.transactions.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ amount: 199, description: 'Coffee' })
  })

  it('clears a stale category selection when the expense/income type is toggled', async () => {
    const rent = await createCategory({ name: 'Rent', color: '#ef4444', type: 'expense' })
    const salary = await createCategory({ name: 'Salary', color: '#059669', type: 'income' })
    render(<MemoryRouter initialEntries={['/entry/new']}><AddEditEntryScreen /></MemoryRouter>)

    const categorySelect = await screen.findByLabelText(/category/i)
    await screen.findByRole('option', { name: 'Rent' })
    await userEvent.selectOptions(categorySelect, rent.id)
    await userEvent.click(screen.getByRole('button', { name: /income/i }))
    await userEvent.type(screen.getByLabelText(/amount/i), '500')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    const saved = await db.transactions.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0].type).toBe('income')
    expect(saved[0].categoryId).toBe(salary.id)
  })

  it('prefills the date from the query string', async () => {
    render(<MemoryRouter initialEntries={['/entry/new?date=2026-07-09']}><AddEditEntryScreen /></MemoryRouter>)

    const dateInput = (await screen.findByLabelText(/date/i)) as HTMLInputElement
    expect(dateInput.value).toBe('2026-07-09')
  })
})

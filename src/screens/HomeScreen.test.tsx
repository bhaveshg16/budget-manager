import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { db } from '../data/db'
import { createTransaction } from '../data/transactions'
import { createCategory } from '../data/categories'
import { HomeScreen } from './HomeScreen'
import { todayDateString } from '../utils/date'

describe('HomeScreen', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('shows the running total for the current month', async () => {
    const category = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await createTransaction({
      type: 'expense', categoryId: category.id, amount: 250, description: 'Lunch',
      date: todayDateString(), time: '13:00',
    })

    render(<BrowserRouter><HomeScreen /></BrowserRouter>)

    expect(await screen.findByText('₹250')).toBeInTheDocument()
  })

  it('links each transaction row to its edit route', async () => {
    const category = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await createTransaction({
      type: 'expense', categoryId: category.id, amount: 250, description: 'Lunch',
      date: todayDateString(), time: '13:00',
    })

    render(<BrowserRouter><HomeScreen /></BrowserRouter>)

    const link = await screen.findByRole('link', { name: /Lunch/i })
    expect(link.getAttribute('href')).toMatch(/^\/entry\/.+/)
  })
})

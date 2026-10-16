import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'
import { CalendarScreen } from './CalendarScreen'
import { db } from '../data/db'
import { createTransaction } from '../data/transactions'
import { createCategory } from '../data/categories'
import { currentMonthString } from '../utils/date'

function renderCalendar() {
  return render(<MemoryRouter><CalendarScreen /></MemoryRouter>)
}

describe('CalendarScreen day view', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('renders the current month label and weekday headers', async () => {
    renderCalendar()
    await waitFor(() => expect(screen.getByTestId('calendar-title')).toBeInTheDocument())
    expect(screen.getAllByText('M').length).toBeGreaterThan(0)
  })

  it('tints the busiest day at the highest heat level', async () => {
    const month = currentMonthString()
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 5000, description: '', date: `${month}-15`, time: '10:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 100, description: '', date: `${month}-16`, time: '10:00' })
    renderCalendar()
    await waitFor(() => expect(screen.getByTestId(`day-${month}-15`)).toHaveClass('bg-heat-5'))
    expect(screen.getByTestId(`day-${month}-16`)).toHaveClass('bg-heat-1')
  })

  it('navigates to the previous month when ‹ is pressed', async () => {
    renderCalendar()
    const title = await screen.findByTestId('calendar-title')
    const initial = title.textContent
    await userEvent.click(screen.getByRole('button', { name: /previous month/i }))
    await waitFor(() => expect(screen.getByTestId('calendar-title').textContent).not.toBe(initial))
  })
})

describe('CalendarScreen day sheet', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('opens the day sheet on cell tap and closes it on Escape', async () => {
    const month = currentMonthString()
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 250, description: 'Snacks', date: `${month}-15`, time: '12:00' })
    renderCalendar()
    await userEvent.click(await screen.findByTestId(`day-${month}-15`))
    expect(await screen.findByRole('button', { name: /add to this day/i })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('button', { name: /add to this day/i })).not.toBeInTheDocument())
  })
})

describe('CalendarScreen year view', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('zooms out to a 12-month grid when the title is tapped, then back in', async () => {
    renderCalendar()
    await userEvent.click(await screen.findByTestId('calendar-title'))
    await waitFor(() => expect(screen.getByTestId('year-title')).toBeInTheDocument())
    expect(screen.getByTestId('month-01')).toBeInTheDocument()
    expect(screen.getByTestId('month-12')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('month-03'))
    await waitFor(() => expect(screen.getByTestId('calendar-title')).toBeInTheDocument())
  })
})

describe('CalendarScreen category filter', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('shows only the chosen category spend in month and year view', async () => {
    const month = currentMonthString()
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    const rent = await createCategory({ name: 'Rent', color: '#ef4444', type: 'expense' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 300, description: '', date: `${month}-10`, time: '10:00' })
    await createTransaction({ type: 'expense', categoryId: rent.id, amount: 9000, description: '', date: `${month}-01`, time: '10:00' })
    renderCalendar()

    expect(await screen.findByText('Spent ₹9300')).toBeInTheDocument()
    await userEvent.selectOptions(await screen.findByLabelText(/category filter/i), food.id)
    expect(await screen.findByText('Spent ₹300')).toBeInTheDocument()
    expect(screen.getByTestId(`day-${month}-01`)).toHaveClass('bg-transparent')
    expect(screen.getByTestId(`day-${month}-10`)).toHaveClass('bg-heat-5')

    await userEvent.click(screen.getByTestId('calendar-title'))
    await waitFor(() => expect(screen.getByTestId('year-title')).toBeInTheDocument())
    expect(screen.getByText('Spent ₹300')).toBeInTheDocument()
    expect(screen.getByLabelText(/category filter/i)).toHaveValue(food.id)
  })
})

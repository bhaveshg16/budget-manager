import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'
import { DaySheet } from './DaySheet'
import { db } from '../data/db'
import { createTransaction } from '../data/transactions'

describe('DaySheet', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('shows the day total and its transactions', async () => {
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 420, description: 'Lunch', date: '2026-07-09', time: '13:00' })
    render(<MemoryRouter><DaySheet date="2026-07-09" onClose={() => {}} /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Lunch')).toBeInTheDocument())
    expect(screen.getByText(/2026-07-09/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to this day/i })).toBeInTheDocument()
  })

  it('navigates to add-entry pre-dated to this day', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DaySheet date="2026-07-09" onClose={() => {}} />} />
          <Route path="/entry/new" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /add to this day/i }))
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/entry/new?date=2026-07-09'))
  })
})

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname}{loc.search}</div>
}

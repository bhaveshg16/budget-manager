import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { seedDefaultCategoriesIfEmpty } from './data/categories'
import { mergeDuplicateCategories } from './data/mergeCategories'
import { catchUpRecurringTransactions } from './data/recurring'
import { syncAll, deleteRemoteRows } from './sync/syncEngine'

const mockUseAuth = vi.fn()
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}))

// The signed-in path fires seeding/catch-up/sync side effects in a useEffect;
// stub them so the App test stays isolated from Dexie and the network.
vi.mock('./data/categories', () => ({ seedDefaultCategoriesIfEmpty: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./data/mergeCategories', () => ({
  mergeDuplicateCategories: vi.fn().mockResolvedValue({ deletedCategoryIds: [], deletedBudgetIds: [] }),
}))
vi.mock('./data/recurring', () => ({ catchUpRecurringTransactions: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./sync/syncEngine', () => ({
  syncAll: vi.fn().mockResolvedValue(undefined),
  deleteRemoteRows: vi.fn().mockResolvedValue(undefined),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the sign-in screen when there is no session', () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false })
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('renders the bottom tab bar when signed in', () => {
    mockUseAuth.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /analytics/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /categories/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add entry/i })).toHaveAttribute('href', '/entry/new')
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  it('boots in order: pull, merge, seed, catch up, push, delete budgets, then delete categories', async () => {
    vi.mocked(mergeDuplicateCategories).mockResolvedValueOnce({
      deletedCategoryIds: ['loser'],
      deletedBudgetIds: ['b-loser'],
    })
    mockUseAuth.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
    render(<BrowserRouter><App /></BrowserRouter>)

    await waitFor(() => expect(deleteRemoteRows).toHaveBeenCalledWith('categories', ['loser']))
    expect(deleteRemoteRows).toHaveBeenNthCalledWith(1, 'budgets', ['b-loser'])
    expect(deleteRemoteRows).toHaveBeenNthCalledWith(2, 'categories', ['loser'])
    expect(seedDefaultCategoriesIfEmpty).toHaveBeenCalledWith('u1')
    expect(syncAll).toHaveBeenCalledTimes(2)

    const [firstSync, secondSync] = vi.mocked(syncAll).mock.invocationCallOrder
    const [merge] = vi.mocked(mergeDuplicateCategories).mock.invocationCallOrder
    const [seed] = vi.mocked(seedDefaultCategoriesIfEmpty).mock.invocationCallOrder
    const [catchUp] = vi.mocked(catchUpRecurringTransactions).mock.invocationCallOrder
    const [deleteBudgets, deleteCategories] = vi.mocked(deleteRemoteRows).mock.invocationCallOrder
    expect(firstSync).toBeLessThan(merge)
    expect(merge).toBeLessThan(seed)
    expect(seed).toBeLessThan(catchUp)
    expect(catchUp).toBeLessThan(secondSync)
    expect(secondSync).toBeLessThan(deleteBudgets)
    expect(deleteBudgets).toBeLessThan(deleteCategories)
  })

  it('logs a boot failure instead of leaving an unhandled rejection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mergeDuplicateCategories).mockRejectedValueOnce(new Error('merge exploded'))
    mockUseAuth.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
    render(<BrowserRouter><App /></BrowserRouter>)

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('boot failed', expect.any(Error)))
    errorSpy.mockRestore()
  })
})

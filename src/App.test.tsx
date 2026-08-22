import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { seedDefaultCategoriesIfEmpty } from './data/categories'
import { mergeDuplicateCategories } from './data/mergeCategories'
import { catchUpRecurringTransactions } from './data/recurring'
import { syncAll, deleteRemoteRows } from './sync/syncEngine'

const mockSignOut = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}))

const { resetMock, syncAllMock } = vi.hoisted(() => ({
  resetMock: vi.fn().mockResolvedValue(false),
  syncAllMock: vi.fn().mockResolvedValue(undefined),
}))

// The signed-in path fires reset/merge/seeding/catch-up/sync side effects in a useEffect;
// stub them so the App test stays isolated from Dexie and the network.
vi.mock('./data/categories', () => ({ seedDefaultCategoriesIfEmpty: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./data/mergeCategories', () => ({
  mergeDuplicateCategories: vi.fn().mockResolvedValue({ deletedCategoryIds: [], deletedBudgetIds: [] }),
}))
vi.mock('./data/recurring', () => ({ catchUpRecurringTransactions: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./sync/syncEngine', () => ({
  syncAll: syncAllMock,
  deleteRemoteRows: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./data/localReset', () => ({ resetLocalDataForUser: resetMock }))

const signedInSession = { session: { user: { id: 'u1', email: 'me@example.com' } }, loading: false, signOut: mockSignOut }

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the sign-in screen when there is no session', () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false, signOut: mockSignOut })
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('renders the bottom tab bar when signed in', async () => {
    mockUseAuth.mockReturnValue(signedInSession)
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(await screen.findByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /analytics/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /categories/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add entry/i })).toHaveAttribute('href', '/entry/new')
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  it('boots in order: reset, pull, merge, seed, catch up, delete budgets, push, then delete categories', async () => {
    vi.mocked(mergeDuplicateCategories).mockResolvedValueOnce({
      deletedCategoryIds: ['loser'],
      deletedBudgetIds: ['b-loser'],
    })
    mockUseAuth.mockReturnValue(signedInSession)
    render(<BrowserRouter><App /></BrowserRouter>)

    await waitFor(() => expect(deleteRemoteRows).toHaveBeenCalledWith('categories', ['loser']))
    expect(deleteRemoteRows).toHaveBeenNthCalledWith(1, 'budgets', ['b-loser'])
    expect(deleteRemoteRows).toHaveBeenNthCalledWith(2, 'categories', ['loser'])
    expect(resetMock).toHaveBeenCalledWith('u1')
    expect(seedDefaultCategoriesIfEmpty).toHaveBeenCalledWith('u1')
    expect(syncAll).toHaveBeenCalledTimes(2)

    const [reset] = resetMock.mock.invocationCallOrder
    const [firstSync, secondSync] = vi.mocked(syncAll).mock.invocationCallOrder
    const [merge] = vi.mocked(mergeDuplicateCategories).mock.invocationCallOrder
    const [seed] = vi.mocked(seedDefaultCategoriesIfEmpty).mock.invocationCallOrder
    const [catchUp] = vi.mocked(catchUpRecurringTransactions).mock.invocationCallOrder
    const [deleteBudgets, deleteCategories] = vi.mocked(deleteRemoteRows).mock.invocationCallOrder
    expect(reset).toBeLessThan(firstSync)
    expect(firstSync).toBeLessThan(merge)
    expect(merge).toBeLessThan(seed)
    expect(seed).toBeLessThan(catchUp)
    expect(catchUp).toBeLessThan(deleteBudgets)
    expect(deleteBudgets).toBeLessThan(secondSync)
    expect(secondSync).toBeLessThan(deleteCategories)
  })

  it('logs a boot failure instead of leaving an unhandled rejection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mergeDuplicateCategories).mockRejectedValueOnce(new Error('merge exploded'))
    mockUseAuth.mockReturnValue(signedInSession)
    render(<BrowserRouter><App /></BrowserRouter>)

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('boot failed', expect.any(Error)))
    errorSpy.mockRestore()
  })

  it('renders the user email and a working sign-out button when signed in', async () => {
    mockUseAuth.mockReturnValue(signedInSession)
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(await screen.findByText('me@example.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('does not render account screens until the local reset resolves', async () => {
    let resolveReset!: () => void
    resetMock.mockImplementationOnce(
      () => new Promise<boolean>((res) => { resolveReset = () => res(false) }),
    )
    mockUseAuth.mockReturnValue(signedInSession)
    render(<BrowserRouter><App /></BrowserRouter>)
    // before reset resolves: authenticated content absent
    expect(screen.queryByText('me@example.com')).not.toBeInTheDocument()
    resolveReset()
    // after: it appears
    expect(await screen.findByText('me@example.com')).toBeInTheDocument()
  })

  it('does not start syncing until the local reset has resolved', async () => {
    let resolveReset!: () => void
    resetMock.mockImplementationOnce(
      () => new Promise<boolean>((res) => { resolveReset = () => res(false) }),
    )
    mockUseAuth.mockReturnValue(signedInSession)
    render(<BrowserRouter><App /></BrowserRouter>)
    // reset is still pending: sync must not have started
    expect(syncAllMock).not.toHaveBeenCalled()
    resolveReset()
    // once reset resolves, sync runs
    await waitFor(() => expect(syncAllMock).toHaveBeenCalled())
  })
})

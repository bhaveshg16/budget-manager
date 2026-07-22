import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

const mockSignOut = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}))

const { resetMock } = vi.hoisted(() => ({ resetMock: vi.fn().mockResolvedValue(false) }))

// The signed-in path fires reset/seeding/catch-up/sync side effects in a useEffect;
// stub them so the App test stays isolated from Dexie and the network.
vi.mock('./data/categories', () => ({ seedDefaultCategoriesIfEmpty: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./data/recurring', () => ({ catchUpRecurringTransactions: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./sync/syncEngine', () => ({ syncAll: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./data/localReset', () => ({ resetLocalDataForUser: resetMock }))

const signedInSession = { session: { user: { id: 'u1', email: 'me@example.com' } }, loading: false, signOut: mockSignOut }

describe('App', () => {
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

  it('renders the user email and a working sign-out button when signed in', async () => {
    mockSignOut.mockClear()
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
})

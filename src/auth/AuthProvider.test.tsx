import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { signOutMock, getSessionMock, onAuthStateChangeMock, syncAllMock } = vi.hoisted(() => ({
  signOutMock: vi.fn().mockResolvedValue({ error: null }),
  getSessionMock: vi.fn().mockResolvedValue({ data: { session: null } }),
  onAuthStateChangeMock: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  syncAllMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: signOutMock,
    },
  },
}))
vi.mock('../sync/syncEngine', () => ({ syncAll: syncAllMock }))

import { AuthProvider, useAuth } from './AuthProvider'

function SignOutButton() {
  const { signOut } = useAuth()
  return <button onClick={() => signOut()}>sign out</button>
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

describe('AuthProvider.signOut', () => {
  beforeEach(() => {
    signOutMock.mockClear()
    syncAllMock.mockClear()
  })

  it('runs a final sync then signs out when online', async () => {
    setOnline(true)
    render(<AuthProvider><SignOutButton /></AuthProvider>)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(signOutMock).toHaveBeenCalled())
    expect(syncAllMock).toHaveBeenCalled()
  })

  it('signs out without syncing when offline', async () => {
    setOnline(false)
    render(<AuthProvider><SignOutButton /></AuthProvider>)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(signOutMock).toHaveBeenCalled())
    expect(syncAllMock).not.toHaveBeenCalled()
    setOnline(true)
  })
})

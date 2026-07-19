import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ session: null, loading: false }),
}))

describe('App', () => {
  it('shows the sign-in screen when there is no session', () => {
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { SignInScreen } from './SignInScreen'

type OtpResult = { error: { message: string } | null }

const { signInWithOtpMock, verifyOtpMock } = vi.hoisted(() => ({
  signInWithOtpMock: vi.fn<() => Promise<OtpResult>>(),
  verifyOtpMock: vi.fn<() => Promise<OtpResult>>(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithOtp: signInWithOtpMock,
      verifyOtp: verifyOtpMock,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}))

function renderSignInScreen() {
  return render(
    <AuthProvider>
      <SignInScreen />
    </AuthProvider>,
  )
}

async function goToCodeStep(email = 'me@example.com') {
  await userEvent.type(screen.getByLabelText(/email/i), email)
  await userEvent.click(screen.getByRole('button', { name: /send code/i }))
  await screen.findByRole('button', { name: /verify/i })
}

describe('SignInScreen', () => {
  beforeEach(() => {
    signInWithOtpMock.mockReset()
    signInWithOtpMock.mockResolvedValue({ error: null })
    verifyOtpMock.mockReset()
    verifyOtpMock.mockResolvedValue({ error: null })
  })

  it('moves to the code-entry step after requesting a code, showing the target email', async () => {
    renderSignInScreen()
    await goToCodeStep('me@example.com')
    expect(screen.getByText(/me@example.com/)).toBeInTheDocument()
    expect(screen.getByLabelText(/code/i)).toBeInTheDocument()
  })

  it('disables the send-code button while the request is in flight, and re-enables it after an error', async () => {
    let resolveRequest!: (value: OtpResult) => void
    signInWithOtpMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )

    renderSignInScreen()
    await userEvent.type(screen.getByLabelText(/email/i), 'me@example.com')
    const button = screen.getByRole('button', { name: /send code/i })
    await userEvent.click(button)

    expect(button).toBeDisabled()

    resolveRequest({ error: { message: 'Something went wrong' } })
    await screen.findByText('Something went wrong')
    expect(button).toBeEnabled()
  })

  it('submits the entered code to verifyOtp for the email that was used', async () => {
    renderSignInScreen()
    await goToCodeStep('me@example.com')

    await userEvent.type(screen.getByLabelText(/code/i), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify/i }))

    expect(verifyOtpMock).toHaveBeenCalledWith({ email: 'me@example.com', token: '123456', type: 'email' })
  })

  it('accepts an 8-digit code in full, without truncating it, since OTP length is not fixed at 6', async () => {
    renderSignInScreen()
    await goToCodeStep('me@example.com')

    const eightDigitCode = '12345678'
    const codeInput = screen.getByLabelText(/code/i)
    await userEvent.type(codeInput, eightDigitCode)
    expect(codeInput).toHaveValue(eightDigitCode)

    await userEvent.click(screen.getByRole('button', { name: /verify/i }))

    expect(verifyOtpMock).toHaveBeenCalledWith({ email: 'me@example.com', token: eightDigitCode, type: 'email' })
  })

  it('shows an error and lets the user retry when the code is invalid, without going back to step 1', async () => {
    verifyOtpMock.mockResolvedValueOnce({ error: { message: 'Invalid code' } })

    renderSignInScreen()
    await goToCodeStep('me@example.com')

    await userEvent.type(screen.getByLabelText(/code/i), '000000')
    await userEvent.click(screen.getByRole('button', { name: /verify/i }))

    expect(await screen.findByText('Invalid code')).toBeInTheDocument()
    // Still on the code step, ready to retry — not bounced back to the email step.
    expect(screen.getByLabelText(/code/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  it('disables the verify button while the request is in flight, and re-enables it after an error', async () => {
    let resolveRequest!: (value: OtpResult) => void
    verifyOtpMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )

    renderSignInScreen()
    await goToCodeStep('me@example.com')

    await userEvent.type(screen.getByLabelText(/code/i), '123456')
    const button = screen.getByRole('button', { name: /verify/i })
    await userEvent.click(button)

    expect(button).toBeDisabled()

    resolveRequest({ error: { message: 'Invalid code' } })
    await screen.findByText('Invalid code')
    expect(button).toBeEnabled()
  })

  it('lets the user go back to the email step to fix a typo, clearing the code and any error', async () => {
    verifyOtpMock.mockResolvedValueOnce({ error: { message: 'Invalid code' } })

    renderSignInScreen()
    await goToCodeStep('me@example.com')

    await userEvent.type(screen.getByLabelText(/code/i), '000000')
    await userEvent.click(screen.getByRole('button', { name: /verify/i }))
    expect(await screen.findByText('Invalid code')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /back/i }))

    // Back on step 1: email is preserved so the user only has to fix the typo, error is gone.
    expect(screen.getByLabelText(/email/i)).toHaveValue('me@example.com')
    expect(screen.queryByLabelText(/code/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Invalid code')).not.toBeInTheDocument()

    // Going forward again shows a cleared code field, not the stale '000000'.
    await userEvent.click(screen.getByRole('button', { name: /send code/i }))
    expect(await screen.findByLabelText(/code/i)).toHaveValue('')
  })
})

import { useState } from 'react'
import { useAuth } from './AuthProvider'

export function SignInScreen() {
  const { signInWithEmail, verifyOtp } = useAuth()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signInWithEmail(email)
    setSubmitting(false)
    if (error) {
      setError(error)
    } else {
      setStep('code')
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await verifyOtp(email, code.trim())
    setSubmitting(false)
    if (error) setError(error)
    // On success there is nothing further to do here: AuthProvider's onAuthStateChange
    // listener picks up the new session and App.tsx re-renders past this screen on its own.
  }

  function handleBack() {
    setStep('email')
    setCode('')
    setError(null)
  }

  if (step === 'code') {
    return (
      <form onSubmit={handleVerify} className="flex flex-col gap-3 p-6 max-w-sm mx-auto">
        <p>Enter the sign-in code sent to {email}.</p>
        <label htmlFor="code">Code</label>
        <input id="code" type="text" inputMode="numeric" required
          autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}
          className="border border-border bg-surface rounded-lg p-2" />
        <button type="submit" disabled={submitting} className="rounded-lg bg-accent text-white p-2">Verify</button>
        <button type="button" onClick={handleBack} className="text-sm text-accent underline">Wrong email? Go back</button>
        {error && <p className="text-red-500">{error}</p>}
      </form>
    )
  }

  return (
    <form onSubmit={handleSendCode} className="flex flex-col gap-3 p-6 max-w-sm mx-auto">
      <label htmlFor="email">Email</label>
      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        className="border border-border bg-surface rounded-lg p-2" />
      <button type="submit" disabled={submitting} className="rounded-lg bg-accent text-white p-2">Send code</button>
      {error && <p className="text-red-500">{error}</p>}
    </form>
  )
}

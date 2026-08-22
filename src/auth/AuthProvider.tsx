import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { syncAll } from '../sync/syncEngine'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  async function signInWithEmail(email: string) {
    const { error } = await supabase.auth.signInWithOtp({ email })
    return { error: error?.message ?? null }
  }

  async function verifyOtp(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    if (navigator.onLine) {
      try {
        await Promise.race([syncAll(), new Promise((resolve) => setTimeout(resolve, 3000))])
      } catch {
        // Best-effort: a failed final sync must not block sign-out.
      }
    }
    await supabase.auth.signOut()
  }

  return <AuthContext.Provider value={{ session, loading, signInWithEmail, verifyOtp, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

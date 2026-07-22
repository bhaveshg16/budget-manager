import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { SignInScreen } from './auth/SignInScreen'
import { seedDefaultCategoriesIfEmpty } from './data/categories'
import { catchUpRecurringTransactions } from './data/recurring'
import { resetLocalDataForUser } from './data/localReset'
import { syncAll } from './sync/syncEngine'
import { todayDateString } from './utils/date'
import { SyncStatus } from './components/SyncStatus'
import { BottomNav } from './components/BottomNav'
import { HomeScreen } from './screens/HomeScreen'
import { CalendarScreen } from './screens/CalendarScreen'
import { AddEditEntryScreen } from './screens/AddEditEntryScreen'
import { AnalyticsScreen } from './screens/AnalyticsScreen'
import { CategoriesBudgetsScreen } from './screens/CategoriesBudgetsScreen'

function App() {
  const { session, loading, signOut } = useAuth()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) return
    setSyncing(true)
    resetLocalDataForUser(userId)
      .then(() => syncAll()) // pull server state first, before any seeding
      .then(() => seedDefaultCategoriesIfEmpty()) // only seeds a genuinely new user (empty after pull)
      .then(() => catchUpRecurringTransactions(todayDateString()))
      .then(() => syncAll()) // push seeded defaults / caught-up recurring rows
      .finally(() => setSyncing(false))
    // Depend on the user id, not the whole session object: Supabase's onAuthStateChange fires
    // TOKEN_REFRESHED roughly hourly with a new session object for the same user, and re-running
    // this on every refresh would be redundant work with no user action behind it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  async function handleSignOut() {
    if (!navigator.onLine && !window.confirm("You're offline. Unsynced changes may be lost. Sign out anyway?")) return
    await signOut()
  }

  if (loading) return null
  if (!session) return <SignInScreen />

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center justify-between gap-2 p-3">
        <span className="truncate text-sm text-muted">{session.user.email}</span>
        <div className="flex items-center gap-3">
          <SyncStatus syncing={syncing} />
          <button onClick={handleSignOut} className="text-sm text-accent">Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 pb-24">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/entry/new" element={<AddEditEntryScreen />} />
          <Route path="/entry/:id" element={<AddEditEntryScreen />} />
          <Route path="/analytics" element={<AnalyticsScreen />} />
          <Route path="/categories" element={<CategoriesBudgetsScreen />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

export default App

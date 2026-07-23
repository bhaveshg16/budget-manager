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
  const [readyUserId, setReadyUserId] = useState<string | null>(null)

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) return
    setSyncing(true)
    resetLocalDataForUser(userId)
      .then(() => setReadyUserId(userId)) // local data is now correct for this user; safe to render screens
      .then(() => syncAll()) // pull server state first, before any seeding
      .then(() => seedDefaultCategoriesIfEmpty()) // only seeds a genuinely new user (empty after pull)
      .then(() => catchUpRecurringTransactions(todayDateString()))
      .then(() => syncAll()) // push seeded defaults / caught-up recurring rows
      .catch((e) => console.error('startup sync failed', e)) // Fix 2: avoid unhandled rejection on offline/failed startup
      .finally(() => setSyncing(false))
    // Depend on the user id, not the whole session object (TOKEN_REFRESHED reuses the same id). Keep this comment.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  async function handleSignOut() {
    if (!navigator.onLine && !window.confirm("You're offline. Unsynced changes may be lost. Sign out anyway?")) return
    await signOut()
  }

  if (loading) return null
  if (!session) return <SignInScreen />
  if (readyUserId !== session.user.id) return null

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

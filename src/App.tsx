import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { SignInScreen } from './auth/SignInScreen'
import { seedDefaultCategoriesIfEmpty } from './data/categories'
import { mergeDuplicateCategories } from './data/mergeCategories'
import { catchUpRecurringTransactions } from './data/recurring'
import { resetLocalDataForUser } from './data/localReset'
import { syncAll, deleteRemoteRows } from './sync/syncEngine'
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
    if (!session) return
    const userId = session.user.id
    const boot = async () => {
      setSyncing(true)
      try {
        await resetLocalDataForUser(userId)
        setReadyUserId(userId) // local data is now correct for this user; safe to render screens
        // Pull first so a fresh device sees existing remote categories before deciding to seed;
        // log-and-continue on network errors so an offline first run still seeds and works locally.
        await syncAll().catch((e) => console.warn('sync failed', e))
        const merged = await mergeDuplicateCategories()
        await seedDefaultCategoriesIfEmpty(userId)
        await catchUpRecurringTransactions(todayDateString())
        // Delete merged-away remote budgets BEFORE pushing: a surviving budget re-pointed to the
        // winner category would otherwise collide with a remote loser row on the
        // unique (user_id, category_id, month) constraint and fail the whole budgets push.
        // Nothing references budget rows, so deleting them early is safe.
        await deleteRemoteRows('budgets', merged.deletedBudgetIds).catch((e) => console.warn('sync failed', e))
        // Second sync pushes re-pointed/seeded rows so the remote FK (`on delete restrict`)
        // no longer blocks deleting the merged-away duplicate categories. If a delete fails,
        // THIS device won't retry — the losers are already gone locally, so the next boot's merge
        // finds nothing to delete. The orphaned remote rows get cleaned up when a fresh device
        // pulls everything, re-merges, and deletes.
        await syncAll().catch((e) => console.warn('sync failed', e))
        await deleteRemoteRows('categories', merged.deletedCategoryIds).catch((e) => console.warn('sync failed', e))
      } finally {
        setSyncing(false)
      }
    }
    boot().catch((e) => console.error('boot failed', e))
    // Depend on the user id, not the whole session object: Supabase's onAuthStateChange fires
    // TOKEN_REFRESHED roughly hourly with a new session object for the same user, and re-running
    // seed/catch-up/sync on every refresh would be redundant network work with no user action behind it.
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

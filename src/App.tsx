import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { SignInScreen } from './auth/SignInScreen'
import { seedDefaultCategoriesIfEmpty } from './data/categories'
import { mergeDuplicateCategories } from './data/mergeCategories'
import { catchUpRecurringTransactions } from './data/recurring'
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
  const { session, loading } = useAuth()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!session) return
    const userId = session.user.id
    const boot = async () => {
      setSyncing(true)
      try {
        // Pull first so a fresh device sees existing remote categories before deciding to seed;
        // swallow network errors so an offline first run still seeds and works locally.
        await syncAll().catch(() => {})
        const merged = await mergeDuplicateCategories()
        await seedDefaultCategoriesIfEmpty(userId)
        await catchUpRecurringTransactions(todayDateString())
        // Second sync pushes re-pointed/seeded rows so the remote FK (`on delete restrict`)
        // no longer blocks deleting the merged-away duplicates. Budgets go first: their rows
        // reference the loser categories. If a delete fails, THIS device won't retry — the losers
        // are already gone locally, so the next boot's merge finds nothing to delete. The orphaned
        // remote rows get cleaned up when a fresh device pulls everything, re-merges, and deletes.
        await syncAll().catch(() => {})
        await deleteRemoteRows('budgets', merged.deletedBudgetIds).catch(() => {})
        await deleteRemoteRows('categories', merged.deletedCategoryIds).catch(() => {})
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

  if (loading) return null
  if (!session) return <SignInScreen />

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center justify-end p-3">
        <SyncStatus syncing={syncing} />
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

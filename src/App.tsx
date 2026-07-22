import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { SignInScreen } from './auth/SignInScreen'
import { seedDefaultCategoriesIfEmpty } from './data/categories'
import { catchUpRecurringTransactions } from './data/recurring'
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
  const { session, loading } = useAuth()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!session) return
    seedDefaultCategoriesIfEmpty()
      .then(() => catchUpRecurringTransactions(todayDateString()))
      .then(() => {
        setSyncing(true)
        return syncAll()
      })
      .finally(() => setSyncing(false))
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

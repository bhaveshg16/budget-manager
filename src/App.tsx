import { useEffect, useState } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { SignInScreen } from './auth/SignInScreen'
import { seedDefaultCategoriesIfEmpty } from './data/categories'
import { catchUpRecurringTransactions } from './data/recurring'
import { syncAll } from './sync/syncEngine'
import { todayDateString } from './utils/date'
import { SyncStatus } from './components/SyncStatus'
import { HomeScreen } from './screens/HomeScreen'
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
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between p-4 border-b">
        <nav className="flex gap-4 text-sm font-medium">
          <Link to="/">Home</Link>
          <Link to="/analytics">Analytics</Link>
          <Link to="/categories">Categories</Link>
        </nav>
        <SyncStatus syncing={syncing} />
      </header>
      <main className="p-4 max-w-lg mx-auto">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/entry/new" element={<AddEditEntryScreen />} />
          <Route path="/entry/:id" element={<AddEditEntryScreen />} />
          <Route path="/analytics" element={<AnalyticsScreen />} />
          <Route path="/categories" element={<CategoriesBudgetsScreen />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

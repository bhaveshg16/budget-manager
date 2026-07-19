import { useEffect, useState } from 'react'

export function SyncStatus({ syncing }: { syncing: boolean }) {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const label = !online ? 'Offline' : syncing ? 'Syncing…' : 'Synced'
  const color = !online ? 'bg-amber-500' : syncing ? 'bg-blue-500' : 'bg-emerald-500'

  return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <span className={`h-2 w-2 rounded-full ${color}`} /> {label}
    </span>
  )
}

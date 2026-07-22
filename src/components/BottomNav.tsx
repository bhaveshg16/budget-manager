import { NavLink } from 'react-router-dom'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'text-accent' : 'text-muted'}`

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <NavLink to="/" end className={tabClass} aria-label="Home">
        <span aria-hidden>🏠</span>Home
      </NavLink>
      <NavLink to="/calendar" className={tabClass} aria-label="Calendar">
        <span aria-hidden>📅</span>Calendar
      </NavLink>
      <NavLink to="/entry/new" aria-label="Add entry"
        className="mx-1 -mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-white shadow-lg">
        +
      </NavLink>
      <NavLink to="/analytics" className={tabClass} aria-label="Analytics">
        <span aria-hidden>📊</span>Analytics
      </NavLink>
      <NavLink to="/categories" className={tabClass} aria-label="Categories">
        <span aria-hidden>🏷️</span>Categories
      </NavLink>
    </nav>
  )
}

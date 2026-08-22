import { db } from './db'
import { resetSyncWatermark } from '../sync/watermark'

export const ACTIVE_USER_KEY = 'budget-manager:activeUserId'

// One account per device: the local (offline) DB belongs to whichever user last signed in on this
// device. If a different user signs in, the previous user's rows must not leak into their view —
// wipe every table and reset the sync cursor so the new user re-pulls a clean copy from the server.
// A first login (no stored id) also counts as a reset so the active-user fingerprint gets recorded.
// Returns true when a reset happened.
export async function resetLocalDataForUser(userId: string): Promise<boolean> {
  const stored = localStorage.getItem(ACTIVE_USER_KEY)
  if (stored === userId) return false
  await Promise.all([
    db.transactions.clear(),
    db.categories.clear(),
    db.budgets.clear(),
    db.recurringRules.clear(),
  ])
  resetSyncWatermark()
  localStorage.setItem(ACTIVE_USER_KEY, userId)
  return true
}

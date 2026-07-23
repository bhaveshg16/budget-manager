const LAST_SYNCED_KEY = 'budget-manager:lastSyncedAt'

export function getLastSyncedAt(): number {
  return Number(localStorage.getItem(LAST_SYNCED_KEY) ?? 0)
}

export function setLastSyncedAt(value: number): void {
  localStorage.setItem(LAST_SYNCED_KEY, String(value))
}

export function resetSyncWatermark(): void {
  localStorage.removeItem(LAST_SYNCED_KEY)
}

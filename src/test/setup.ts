import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// Node's own experimental global `localStorage` shadows jsdom's working implementation and
// resolves to `undefined` unless the process is started with `--localstorage-file`. Polyfill it
// with a minimal in-memory Storage so tests can use the standard localStorage API.
if (typeof localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => {
        store.clear()
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size
      },
    },
  })
}

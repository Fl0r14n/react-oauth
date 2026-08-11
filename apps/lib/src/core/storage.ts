import { createStore, type Subscribable } from './store'

/** Treats an unusable entry as an absent one.
 *
 * Two failures land here. A stored value that is not JSON — a truncated write, another library on the
 * same key, someone editing devtools — used to throw out of `JSON.parse`, and `seed()` runs during
 * `createStorageStore`, so `createOAuth()` threw at *module scope*, where the app has nothing to catch
 * it and never renders. And `localStorage` itself throws on access when storage is disabled by policy.
 * Neither is worth more than starting signed-out. */
const read = (key: string) => {
  try {
    const value = globalThis.localStorage?.getItem(key)
    return (value && JSON.parse(value)) || undefined
  } catch {
    /* not usable — indistinguishable from nothing stored, and treated as such */
    return undefined
  }
}

/** Best-effort persistence: `setItem` throws on an exceeded quota and in Safari's private mode.
 *
 * Dropping the write keeps the session working for this page — the store holds the value either way, it
 * just will not survive a reload. Throwing instead would come out of `setToken`, which is on the path of
 * `login`, `logout`, `oauthCallback` and the 401 handler, so a full disk would break signing in. */
const write = (key: string, value: any) => {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    /* quota exceeded, or storage unavailable — in-memory state stands on its own */
  }
}

export interface StorageStore<T> {
  store: Subscribable<{ value: T }>
  get: () => T
  set: (value: T) => void
  /** re-point at another storage key: load that key's value without writing it back */
  rekey: (key: string) => void
  /** start following other tabs' writes to the current key. Returns the teardown. */
  listen: () => () => void
}

/** Writes persist synchronously, deliberately: a token write is often followed straight away by a
 * navigation (authorize/logout redirect), so persisting at write time is safe by construction rather
 * than by scheduler timing.
 *
 * Persistence lives in `set`, not in a store subscriber. A subscriber fires for every write including
 * `rekey`'s, which must not persist, and the only way to tell them apart from inside a listener is a
 * mutable flag — which a re-entrant write during the notification cascade then reads in the wrong
 * state, silently dropping that write. Owning the write path removes the distinction entirely. */
export const createStorageStore = <T>(initialKey: string, initial: T, map?: (v: any) => T): StorageStore<T> => {
  const seed = (key: string): T => {
    const stored = read(key)
    return map?.(stored || initial) || stored || initial
  }

  let key = initialKey
  const store = createStore<{ value: T }>({ value: seed(initialKey) })

  return {
    store,
    get: () => store.getState().value,
    set: value => {
      // persist before notifying: a listener may navigate away before the cascade finishes
      write(key, value)
      store.setState({ value })
    },
    rekey: newKey => {
      if (newKey === key) return
      key = newKey
      // a read must never write — otherwise switching keys stamps the old token onto the new one.
      // Subscribers are still notified: React has to learn the token changed.
      store.setState({ value: seed(newKey) })
    },
    /** Follows other tabs. Without this, signing out in one tab leaves every other tab holding a token
     * the user believes they discarded — and a tab that refreshed in the background leaves the others on
     * a token that is already dead.
     *
     * The event fires only in *other* documents, so this cannot loop with our own writes. `key === null`
     * is a `clear()`, which took our entry with it. Attaching is deferred to a `listen()` call rather than
     * done in the constructor because construction is deliberately inert, and because SSR has no
     * `addEventListener` to attach to — hence the optional call. */
    listen: () => {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== key) return
        store.setState({ value: seed(key) })
      }
      globalThis.addEventListener?.('storage', onStorage)
      return () => globalThis.removeEventListener?.('storage', onStorage)
    }
  }
}

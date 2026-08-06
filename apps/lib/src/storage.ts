import { createStore, type Subscribable } from './store'

const read = (key: string) => {
  const value = globalThis.localStorage?.getItem(key)
  return (value && JSON.parse(value)) || undefined
}

const write = (key: string, value: any) => {
  globalThis.localStorage?.setItem(key, JSON.stringify(value))
}

export interface StorageStore<T> {
  store: Subscribable<{ value: T }>
  get: () => T
  set: (value: T) => void
  /** re-point at another storage key: load that key's value without writing it back */
  rekey: (key: string) => void
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
    }
  }
}

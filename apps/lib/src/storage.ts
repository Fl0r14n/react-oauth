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

/** Writes persist synchronously inside the store update, deliberately: a token write is often followed
 * straight away by a navigation (authorize/logout redirect), so persisting at write time is safe by
 * construction rather than by scheduler timing. */
export const createStorageStore = <T>(initialKey: string, initial: T, map?: (v: any) => T): StorageStore<T> => {
  const seed = (key: string): T => {
    const stored = read(key)
    return map?.(stored || initial) || stored || initial
  }

  let key = initialKey
  let persisting = true
  const store = createStore<{ value: T }>({ value: seed(initialKey) })
  store.subscribe(state => {
    if (persisting) {
      write(key, state.value)
    }
  })

  return {
    store,
    get: () => store.getState().value,
    set: value => store.setState({ value }),
    rekey: newKey => {
      if (newKey === key) return
      key = newKey
      // a read must never write — otherwise switching keys stamps the old token onto the new one
      persisting = false
      store.setState({ value: seed(newKey) })
      persisting = true
    }
  }
}

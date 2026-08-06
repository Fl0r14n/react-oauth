import { useSyncExternalStore } from 'react'

export interface Subscribable<S> {
  getState: () => S
  subscribe: (listener: (state: S, previous: S) => void) => () => void
}

// tuple selectors are the common case (Vue's `watch([a, b], ...)`), and a fresh array is never
// Object.is-equal to the last one — compare element-wise so they don't fire on every state change
const defaultEquals = (a: any, b: any) =>
  Object.is(a, b) || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i])))

export interface WatchOptions<T> {
  immediate?: boolean
  equals?: (a: T, b: T) => boolean
}

/** Fires only when the *selected* value changes, not on every state write. Returns the unsubscribe.
 * Callbacks run synchronously inside the store write. */
export const watchStore = <S, T>(
  store: Subscribable<S>,
  selector: (state: S) => T,
  callback: (value: T, previous: T | undefined) => void,
  options?: WatchOptions<T>
) => {
  const equals = options?.equals ?? defaultEquals
  let previous = selector(store.getState())
  if (options?.immediate) {
    callback(previous, undefined)
  }
  return store.subscribe(state => {
    const next = selector(state)
    if (!equals(next, previous)) {
      const prior = previous
      previous = next
      callback(next, prior)
    }
  })
}

/** Used instead of zustand's own `useStore`, which passes `getInitialState` as `getServerSnapshot` —
 * on the server that renders the state the store had at *creation*, so anything written afterwards
 * (a restored token, a discovered config) is invisible to `renderToString`.
 *
 * `selector` must return a stable reference for unchanged state, or this re-renders forever. */
export const useStoreValue = <S, T>(store: Subscribable<S>, selector: (state: S) => T): T => {
  const snapshot = () => selector(store.getState())
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}

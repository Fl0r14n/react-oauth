/** No React import in this file, deliberately: every core module imports `createStore` from here, so a
 * React import would drag React into the graph of the protocol layer that is meant to run without it.
 * The React binding for these stores is `useStoreValue` in `hooks.ts`. */

/** The read side. Public store surfaces are typed as this so writes have to go through the accessors
 * that own persistence and the `expires` computation. */
export interface Subscribable<S> {
  getState: () => S
  subscribe: (listener: (state: S, previous: S) => void) => () => void
}

export interface Store<S> extends Subscribable<S> {
  setState: (next: S) => void
}

/** Replaces the whole state rather than shallow-merging a partial: every store here holds one key, so
 * merge semantics bought nothing and hid which writes were complete. Listeners run synchronously. */
export const createStore = <S>(initial: S): Store<S> => {
  let state = initial
  const listeners = new Set<(state: S, previous: S) => void>()

  return {
    getState: () => state,
    setState: next => {
      const previous = state
      if (Object.is(next, previous)) return
      state = next
      // iterate a copy: a listener may subscribe or unsubscribe while the cascade is still running
      for (const listener of [...listeners]) {
        listener(state, previous)
      }
    },
    subscribe: listener => {
      listeners.add(listener)
      // block body, not `() => listeners.delete(listener)` — that would return boolean, not void
      return () => {
        listeners.delete(listener)
      }
    }
  }
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

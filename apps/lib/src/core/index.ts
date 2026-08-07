/** The protocol layer, with no React in its import graph — safe in a route handler, a worker, a server
 * component, or a plain service. Published as `react-oauth-oidc/core`.
 *
 * The package root re-exports all of this *and* the React bindings, but carries a `'use client'` banner
 * because of them. Import from here when the consumer is not a client component.
 *
 * Nothing reachable from this file may import `hooks.ts`, `provider.tsx` or `component/` — that is the
 * whole point, and `verify-entries.ts` (run as part of `bun run build`) checks it. */
export { defaultOAuthFunctions } from './functions'
export * from './module'
export { createStorageStore, type StorageStore } from './storage'
export { createStore, type Store, type Subscribable, type WatchOptions, watchStore } from './store'
export { isExpiredToken, type TokenState, tokenState } from './token'
export * from './types'

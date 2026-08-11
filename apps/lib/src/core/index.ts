/** The protocol layer, with no React in its import graph — safe in a route handler, a worker, a server
 * component or a plain service. Published as `react-oauth-oidc/core`.
 *
 * Nothing reachable from this file may import `hooks.ts`, `provider.tsx` or `component/`. That is the whole
 * point of the entry, and `verify-entries.ts` (part of `bun run build`) enforces it. */
export { defaultOAuthFunctions } from './functions'
export * from './module'
export { createStorageStore, type StorageStore } from './storage'
export { createStore, type Store, type Subscribable, type WatchOptions, watchStore } from './store'
export { isExpiredToken, type TokenState, tokenState } from './token'
export * from './types'

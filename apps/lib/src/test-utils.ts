import { afterEach, jest } from 'bun:test'
import { createOAuth as create } from './module'
import type { OAuth, OAuthConfig, OAuthFunctions } from './types'

/** Shared spec helpers. Not part of the published build — `tsdown` only follows the two entry points. */

// Specs must dispose what they create: the alive-instance count drives the server-side ambiguity
// detection in getActiveOAuth, and bun runs every spec file in one process — leaked instances from
// one file would trip the ambiguity error in another. This tracked factory disposes automatically.
const live: OAuth[] = []

/** Call at the top of every spec file using {@link createOAuth} — this module is cached, so a
 * module-level `afterEach` would register in the first importing file only. */
export const registerOAuthCleanup = () =>
  afterEach(() => {
    live.splice(0).forEach(instance => {
      instance.dispose()
    })
  })

export const createOAuth = (cfg?: OAuthConfig): OAuth => {
  const instance = create(cfg)
  live.push(instance)
  return instance
}

/** Typed mocks, so a spec never reaches the network. */
export const mockOAuthFunctions = () => ({
  refresh: jest.fn<OAuthFunctions['refresh']>(),
  revoke: jest.fn<OAuthFunctions['revoke']>(),
  authorize: jest.fn<OAuthFunctions['authorize']>(),
  resourceOwnerLogin: jest.fn<OAuthFunctions['resourceOwnerLogin']>(),
  clientCredentialLogin: jest.fn<OAuthFunctions['clientCredentialLogin']>(),
  openIdConfiguration: jest.fn<OAuthFunctions['openIdConfiguration']>(),
  userInfo: jest.fn<OAuthFunctions['userInfo']>(),
  introspect: jest.fn<OAuthFunctions['introspect']>()
})

/** happy-dom ships a `localStorage`, but specs need one they can clear deterministically between
 * files. `storage.ts` reads the global lazily, so installing this after import is enough. */
export const installStorage = (): Storage => {
  const m = new Map<string, string>()
  const storage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    }
  } as Storage
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  return storage
}

/** Unsigned id_token — enough for the local `parseJwt` path. */
export const idToken = (payload: object) => {
  const b64 = (value: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(value)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64(JSON.stringify({ alg: 'none' }))}.${b64(JSON.stringify(payload))}.sig`
}

/** Lets the watchers' async callbacks settle. */
export const flush = () => new Promise(resolve => setTimeout(resolve, 0))

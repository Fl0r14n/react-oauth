import { useSyncExternalStore } from 'react'
// by package name, not relatively: this entry is bundled with the core kept external, so a relative
// import would inline a second copy of it. See AGENTS.md.
import {
  isExpiredToken,
  type OAuth,
  type OAuthConfig,
  type OAuthStatus,
  type OAuthToken,
  type OAuthType,
  type OAuthTypeConfig,
  type Subscribable,
  tokenState,
  type UserInfo
} from 'react-oauth-oidc/core'
import { useOAuthInstance } from './provider'

/** Every hook here subscribes. Outside React use the instance's getters instead — a getter is invisible
 * to React, so `oauth.isAuthorized()` read in a component renders once and never updates. */

/** The React binding for the stores in `store.ts`, which are deliberately React-free.
 *
 * `serverSelector` is what the server rendered. Omit it for state the server genuinely has — the config
 * is passed to `createOAuth`, so it must keep reading live or `renderToString` would miss a discovered
 * endpoint. Pass it for state that only exists in the browser: without it, `getSnapshot` reads
 * `localStorage` during hydration, the server's HTML says signed-out, and the two disagree.
 *
 * React calls `getSnapshot` again after hydration and re-renders if it moved, so the browser-only value
 * still lands — one render later, and without a mismatch.
 *
 * Both selectors must return a stable reference for unchanged state, or this re-renders forever. */
export const useStoreValue = <S, T>(store: Subscribable<S>, selector: (state: S) => T, serverSelector?: (state: S) => T): T => {
  const snapshot = () => selector(store.getState())
  const serverSnapshot = serverSelector ? () => serverSelector(store.getState()) : snapshot
  return useSyncExternalStore(store.subscribe, snapshot, serverSnapshot)
}

/** `storage.ts` reads `localStorage`, which the server does not have, so an empty token is always what
 * the server rendered. Frozen and module-level because `useSyncExternalStore` needs the reference to be
 * stable across calls. */
const SERVER_TOKEN: OAuthToken = Object.freeze({})
const serverToken = () => SERVER_TOKEN
// the user is derived from the id_token, and `fetchUser` is async — neither resolves during a server pass
const serverUser = () => undefined

export const useOAuthToken = () => {
  const { tokenStore, setToken } = useOAuthInstance()
  return { value: useStoreValue(tokenStore, state => state.value, serverToken), set: setToken }
}

/** id_token claims, replaced by the `userinfo` response when a `userPath` is configured. */
export const useOAuthUser = (): UserInfo | undefined => useStoreValue(useOAuthInstance().userStore, state => state.user, serverUser)

/** `config` is the provider/endpoint half — the part `autoconfigOauth()` fills in from discovery. */
export const useOAuthConfig = () => {
  const { configStore, setOAuthConfig, setConfig, setStorageKey, ignorePath } = useOAuthInstance()
  const oauthConfig = useStoreValue(configStore, state => state.oauthConfig)
  return {
    oauthConfig,
    config: oauthConfig.config as Partial<OAuthTypeConfig> | undefined,
    storageKey: oauthConfig.storageKey || 'token',
    set: setOAuthConfig as (config: Partial<OAuthConfig>) => void,
    setConfig,
    setStorageKey,
    ignorePath
  }
}

export const useOAuthHttp = () => useOAuthInstance().http

export const useOAuthInterceptors = () => {
  const { authorizationInterceptor, unauthorizedInterceptor } = useOAuthInstance()
  return { authorizationInterceptor, unauthorizedInterceptor }
}

export const useOAuthFunctions = () => useOAuthInstance().functions

export interface OAuthState {
  type: OAuthType | undefined
  accessToken: string | undefined
  status: OAuthStatus
  isAuthorized: boolean
  error: string | undefined
  hasError: boolean
  errorDescription: string | undefined
  /** the `state` parameter echoed back by the last authorization redirect */
  state: string | undefined
  config: Partial<OAuthTypeConfig> | undefined
  storageKey: string
  setConfig: OAuth['setConfig']
  setStorageKey: OAuth['setStorageKey']
  ignorePath: OAuth['ignorePath']
  login: OAuth['login']
  logout: OAuth['logout']
  oauthCallback: OAuth['oauthCallback']
  autoconfigOauth: OAuth['autoconfigOauth']
  isExpiredToken: typeof isExpiredToken
}

export const useOAuth = (): OAuthState => {
  const oauth = useOAuthInstance()
  // derived from the subscribed snapshots, not from the instance getters: a getter reads whatever the
  // store holds now, which during hydration is the restored token rather than the empty one the server
  // rendered. `tokenState` is the shared derivation, so the getters and this cannot disagree.
  const token = useStoreValue(oauth.tokenStore, state => state.value, serverToken)
  const oauthConfig = useStoreValue(oauth.configStore, state => state.oauthConfig)
  const echoedState = useStoreValue(oauth.stateStore, state => state.state)

  return {
    ...tokenState(token),
    state: echoedState,
    config: oauthConfig.config as Partial<OAuthTypeConfig> | undefined,
    storageKey: oauthConfig.storageKey || 'token',
    setConfig: oauth.setConfig,
    setStorageKey: oauth.setStorageKey,
    ignorePath: oauth.ignorePath,
    login: oauth.login,
    logout: oauth.logout,
    oauthCallback: oauth.oauthCallback,
    autoconfigOauth: oauth.autoconfigOauth,
    isExpiredToken
  }
}

export interface Auth {
  isLoggedIn: boolean
  token: OAuthToken
  user?: UserInfo
  error?: string
  login: OAuth['login']
  logout: OAuth['logout']
  oauth: OAuth
}

export const useAuth = (): Auth => {
  const oauth = useOAuthInstance()
  const token = useStoreValue(oauth.tokenStore, state => state.value, serverToken)
  const user = useStoreValue(oauth.userStore, state => state.user, serverUser)
  const { isAuthorized, errorDescription } = tokenState(token)

  return {
    isLoggedIn: isAuthorized,
    token,
    user,
    error: errorDescription,
    login: oauth.login,
    logout: oauth.logout,
    oauth
  }
}
